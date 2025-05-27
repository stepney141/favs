import { PromiseQueue, sleep, randomWait } from "../../utils/apiUtils";

import { extractUnfoundBooks, mergeResults, searchBookWithProviders } from "./helpers";
import { createOpenBDProvider, createGoogleBooksProvider, createISBNdbProvider, createNDLProvider } from "./providers";

import type { APICredentials, BiblioInfoService, BookSearchResult, ProviderCollection } from "./types";
import type { Logger } from "@/application/ports/output/logger";
import type { Book, BookList } from "@/domain/models/book";
import type { BookIdentifier } from "@/domain/models/valueObjects";

/**
 * OpenBDで一括取得を行い、見つからなかった書籍の結果を返す
 */
const fetchBulkWithOpenBD = async (
  bookList: BookList,
  providers: ProviderCollection,
  signal?: AbortSignal,
  logger?: Logger
): Promise<BookSearchResult[]> => {
  if (!providers.openBD) {
    // OpenBDプロバイダーがない場合は全て未発見として返す
    return Array.from(bookList.values()).map((book) => ({
      book,
      isFound: false
    }));
  }

  // ISBN/ASINを抽出
  const identifiers = Array.from(bookList.values())
    .map((book) => book.identifier)
    .filter((id): id is BookIdentifier => !!id && providers.openBD!.config.supportsIdentifier(id));

  if (identifiers.length === 0) {
    return Array.from(bookList.values()).map((book) => ({
      book,
      isFound: false
    }));
  }

  try {
    logger?.info(`OpenBDで${identifiers.length}冊を一括取得中...`);

    const bulkResult = await providers.openBD.fetchBulk(identifiers);

    if (!bulkResult.isSuccess()) {
      logger?.error(`OpenBD一括取得でエラー: ${bulkResult.unwrapError().message}`);
      return Array.from(bookList.values()).map((book) => ({
        book,
        isFound: false
      }));
    }

    const bookInfoMap = bulkResult.unwrap();
    const results: BookSearchResult[] = [];

    for (const [url, originalBook] of bookList.entries()) {
      if (signal?.aborted) {
        throw new Error("処理がキャンセルされました");
      }

      if (originalBook.identifier && bookInfoMap.has(originalBook.identifier)) {
        // OpenBDで見つかった場合
        const foundBook = bookInfoMap.get(originalBook.identifier)!;
        results.push({
          book: {
            ...originalBook,
            title: foundBook.title || originalBook.title,
            author: foundBook.author || originalBook.author,
            publisher: foundBook.publisher || originalBook.publisher,
            publishedDate: foundBook.publishedDate || originalBook.publishedDate,
            description: foundBook.description || originalBook.description
          },
          isFound: true
        });
      } else {
        // OpenBDで見つからなかった場合
        results.push({
          book: originalBook,
          isFound: false
        });
      }
    }

    logger?.info(`OpenBDで${results.filter((r) => r.isFound).length}冊が見つかりました`);
    return results;
  } catch (error) {
    logger?.error(`OpenBD一括取得中にエラー: ${error instanceof Error ? error.message : String(error)}`);
    return Array.from(bookList.values()).map((book) => ({
      book,
      isFound: false
    }));
  }
};

/**
 * 個別書籍を並列処理で検索
 */
const fetchIndividualBooks = async (
  books: Book[],
  providers: ProviderCollection,
  signal?: AbortSignal,
  logger?: Logger
): Promise<BookSearchResult[]> => {
  if (books.length === 0) {
    return [];
  }

  logger?.info(`OpenBDで見つからなかった${books.length}冊を他のAPIで検索します`);

  const CONCURRENCY = 5;
  const queue = PromiseQueue();
  const results: BookSearchResult[] = [];

  for (const book of books) {
    queue.add(() => searchBookWithProviders(book, providers.individual, signal, logger));

    // 並列度を制御して実行
    const result = await queue.wait(CONCURRENCY);
    if (result !== false) {
      results.push(result as BookSearchResult);
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    if (signal?.aborted) {
      throw new Error("処理がキャンセルされました");
    }
  }

  // 残りの処理を完了
  const remainingResults = (await queue.all()) as BookSearchResult[];
  results.push(...remainingResults);

  return results;
};

/**
 * 書誌情報サービスファクトリ
 */
export const createBiblioInfoService = (credentials: APICredentials, logger?: Logger): BiblioInfoService => {
  // プロバイダーを作成
  const openBDProvider = createOpenBDProvider(logger);
  const individualProviders = [
    createNDLProvider(logger),
    createISBNdbProvider(credentials.isbndb, logger),
    createGoogleBooksProvider(credentials.google, logger)
  ];

  const providers: ProviderCollection = {
    openBD: openBDProvider,
    individual: individualProviders
  };

  return {
    fetchBiblioInfo: async (bookList: BookList, signal?: AbortSignal): Promise<BookList> => {
      logger?.info(`書誌情報の取得を開始します（${bookList.size}冊）`);

      try {
        // キャンセル確認
        if (signal?.aborted) {
          throw new Error("処理がキャンセルされました");
        }

        // ステップ1: OpenBDで一括取得
        const bulkSearchResults = await fetchBulkWithOpenBD(bookList, providers, signal, logger);

        // ステップ2: OpenBDで見つからなかった書籍のみを他のAPIで個別処理
        const notFoundBooks = extractUnfoundBooks(bulkSearchResults);

        let individualResults: BookSearchResult[] = [];
        if (notFoundBooks.length > 0) {
          individualResults = await fetchIndividualBooks(notFoundBooks, providers, signal, logger);
        }

        // ステップ3: 結果をマージ
        const mergedResults = mergeResults(bulkSearchResults, individualResults);

        logger?.info(`${bookList.size}冊の書誌情報取得が完了しました`);
        return mergedResults;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger?.error(`書誌情報の取得中にエラーが発生しました: ${message}`, {
          error: error instanceof Error ? error.stack : String(error)
        });
        throw error;
      }
    }
  };
};
