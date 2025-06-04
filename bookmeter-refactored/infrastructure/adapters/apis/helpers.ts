import { sleep, randomWait } from "../../utils/apiUtils";

import type { BookSearchResult, SingleProvider } from "./types";
import type { Logger } from "@/application/ports/output/logger";
import type { Book, BookList } from "@/domain/models/book";
import type { BookIdentifier } from "@/domain/models/isbn";

import { isAsin, isIsbn10, isIsbn13, routeIsbn10 } from "@/domain/services/isbnService";

/**
 * ISBN識別子をサポートするかどうかをチェックする関数
 */
export const isIsbnIdentifier = (identifier: BookIdentifier): boolean => {
  return isIsbn10(identifier) || isIsbn13(identifier);
};

/**
 * 書籍の地域（日本 or その他）を判定
 */
export const determineBookRegion = (identifier: BookIdentifier): "Japan" | "Others" => {
  if (isAsin(identifier)) {
    return "Others";
  }

  if (isIsbn10(identifier)) {
    return routeIsbn10(identifier);
  }

  return "Others";
};

/**
 * 地域別に最適な順序でプロバイダーを取得
 * 和書: NDL → ISBNdb → GoogleBooks (NDLは国内書籍に強い)
 * 洋書: ISBNdb → NDL → GoogleBooks (ISBNdbは海外書籍に強い)
 */
export const getProvidersForRegion = (identifier: BookIdentifier, providers: SingleProvider[]): SingleProvider[] => {
  const supportedProviders = providers.filter((provider) => provider.config.supportsIdentifier(identifier));

  const region = determineBookRegion(identifier);

  if (region === "Japan") {
    // 和書: NDL → ISBNdb → GoogleBooks
    return supportedProviders.sort((a, b) => {
      const aName = a.config.name;
      const bName = b.config.name;

      const order = ["NDL", "ISBNdb", "GoogleBooks"];
      const aIndex = order.indexOf(aName);
      const bIndex = order.indexOf(bName);

      // orderにない場合は最後に
      const aOrder = aIndex === -1 ? order.length : aIndex;
      const bOrder = bIndex === -1 ? order.length : bIndex;

      return aOrder - bOrder;
    });
  } else {
    // 洋書: ISBNdb → NDL → GoogleBooks
    return supportedProviders.sort((a, b) => {
      const aName = a.config.name;
      const bName = b.config.name;

      const order = ["ISBNdb", "NDL", "GoogleBooks"];
      const aIndex = order.indexOf(aName);
      const bIndex = order.indexOf(bName);

      // orderにない場合は最後に
      const aOrder = aIndex === -1 ? order.length : aIndex;
      const bOrder = bIndex === -1 ? order.length : bIndex;

      return aOrder - bOrder;
    });
  }
};

/**
 * OpenBDで見つからなかった書籍を抽出
 */
export const extractUnfoundBooks = (searchResults: BookSearchResult[]): Book[] => {
  return searchResults.filter((result) => !result.isFound).map((result) => result.book);
};

/**
 * 検索結果をマージしてBookListに変換
 */
export const mergeResults = (bulkResults: BookSearchResult[], individualResults: BookSearchResult[]): BookList => {
  const mergedBooks = new Map<string, Book>();

  // 一括取得結果を追加
  for (const result of bulkResults) {
    mergedBooks.set(result.book.url, result.book);
  }

  // 個別取得結果を追加（上書き）
  for (const result of individualResults) {
    mergedBooks.set(result.book.url, result.book);
  }

  return mergedBooks;
};

/**
 * 個別書籍検索を実行（プロバイダーを順番に試す）
 */
export const searchBookWithProviders = async (
  book: Readonly<Book>,
  providers: SingleProvider[],
  signal?: AbortSignal,
  logger?: Logger
): Promise<BookSearchResult> => {
  if (!book.identifier || isAsin(book.identifier)) {
    return { book, isFound: false }; // ASINは個別APIでは処理しない
  }

  logger?.debug(`個別API検索: ${book.title}`, {
    identifier: book.identifier
  });

  let enhancedBook = book;
  let isFound = false;

  // 地域別最適順序でプロバイダーを取得
  const orderedProviders = getProvidersForRegion(book.identifier, providers);

  // 各プロバイダーを順番に試す
  for (const provider of orderedProviders) {
    if (signal?.aborted) {
      throw new Error("処理がキャンセルされました");
    }

    try {
      const result = await provider.fetchSingle(book.identifier);

      if (result.isSuccess()) {
        const bookInfo = result.unwrap();
        // 既存の書籍情報を更新
        enhancedBook = {
          ...enhancedBook,
          title: bookInfo.title || enhancedBook.title,
          author: bookInfo.author || enhancedBook.author,
          publisher: bookInfo.publisher || enhancedBook.publisher,
          publishedDate: bookInfo.publishedDate || enhancedBook.publishedDate,
          description: bookInfo.description || enhancedBook.description
        };
        isFound = true;
        logger?.debug(`${provider.config.name}で書籍情報を取得: ${enhancedBook.title}`);
        break; // 見つかったら終了
      } else {
        const error = result.unwrapError();
        if (error.statusCode !== 404) {
          logger?.debug(`${provider.config.name}でエラー: ${error.message}`);
        }
      }
    } catch (error) {
      logger?.debug(
        `${provider.config.name}で予期せぬエラー: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    await sleep(randomWait(1500, 0.8, 1.2));
  }

  return {
    book: enhancedBook,
    isFound
  };
};
