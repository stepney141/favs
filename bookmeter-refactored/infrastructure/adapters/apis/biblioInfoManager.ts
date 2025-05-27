import { PromiseQueue, sleep, randomWait } from "../../utils/apiUtils";

import { OpenBDProvider } from "./openBDProvider";

import type { BiblioInfoProvider } from "@/application/ports/output/biblioInfoProvider";
import type { Book, BookList } from "@/domain/models/book";
import type { BookIdentifier } from "@/domain/models/valueObjects";

import { isAsin, isIsbn10, routeIsbn10 } from "@/domain/services/isbnService";

/**
 * 書誌情報の検索状態を表す型
 */
interface BookSearchState {
  book: Book;
  isFound: boolean;
}

/**
 * 書誌情報プロバイダーを管理し、適切なプロバイダーを使用して書誌情報を取得するマネージャークラス
 */
export class BiblioInfoManager {
  private readonly logger: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
    debug: (message: string, data?: object) => void;
  };
  private readonly providers: BiblioInfoProvider[];

  constructor(
    providers: BiblioInfoProvider[],
    logger?: {
      info: (message: string, data?: object) => void;
      error: (message: string, data?: object) => void;
      debug: (message: string, data?: object) => void;
    }
  ) {
    this.providers = providers;
    this.logger = logger || {
      info: console.log,
      error: console.error,
      debug: console.log
    };
  }

  /**
   * 書籍リストに対して書誌情報を一括取得し、更新する
   * 元の実装の効率的な仕組みを適用：
   * 1. OpenBDで多数の書籍を一括取得 (無駄なクエリを消費しないため)
   * 2. OpenBDで取得できなかったもののみ他のAPIで個別処理
   */
  async fetchBiblioInfo(bookList: BookList, signal?: AbortSignal): Promise<BookList> {
    this.logger.info(`書誌情報の取得を開始します（${bookList.size}冊）`);

    try {
      // キャンセル確認
      if (signal?.aborted) {
        throw new Error("処理がキャンセルされました");
      }

      const enhancedBooks = new Map<string, Book>();

      // ステップ1: OpenBDで一括取得
      const bulkSearchResults = await this.bulkFetchWithOpenBD(bookList, signal);

      // ステップ2: OpenBDで見つからなかった書籍のみを他のAPIで個別処理
      const notFoundBooks = bulkSearchResults.filter(result => !result.isFound);
      
      if (notFoundBooks.length > 0) {
        this.logger.info(`OpenBDで見つからなかった${notFoundBooks.length}冊を他のAPIで検索します`);
        
        const CONCURRENCY = 5;
        const queue = PromiseQueue();

        for (const searchState of notFoundBooks) {
          queue.add(() => this.fetchWithSingleRequestAPIs(searchState, signal));

          const result = await queue.wait(CONCURRENCY);
          if (result !== false) {
            const enhancedState = result as BookSearchState;
            enhancedBooks.set(enhancedState.book.url, enhancedState.book);
          }

          await sleep(randomWait(1500, 0.8, 1.2));

          if (signal?.aborted) {
            throw new Error("処理がキャンセルされました");
          }
        }

        // 残りの処理を完了
        const remainingResults = (await queue.all()) as BookSearchState[];
        for (const result of remainingResults) {
          enhancedBooks.set(result.book.url, result.book);
        }
      }

      // OpenBDで見つかった書籍も結果に追加
      for (const searchState of bulkSearchResults) {
        if (searchState.isFound) {
          enhancedBooks.set(searchState.book.url, searchState.book);
        }
      }

      this.logger.info(`${bookList.size}冊の書誌情報取得が完了しました`);
      return enhancedBooks;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`書誌情報の取得中にエラーが発生しました: ${message}`, {
        error: error instanceof Error ? error.stack : String(error)
      });
      throw error;
    }
  }

  /**
   * OpenBDで書籍リストを一括取得
   */
  private async bulkFetchWithOpenBD(bookList: BookList, signal?: AbortSignal): Promise<BookSearchState[]> {
    const openBdProvider = this.providers.find(p => p instanceof OpenBDProvider) as OpenBDProvider;
    if (!openBdProvider) {
      this.logger.error("OpenBDProviderが見つかりません");
      // OpenBDがない場合は全て未発見として返す
      return Array.from(bookList.values()).map(book => ({
        book,
        isFound: false
      }));
    }

    // ISBN/ASINを抽出
    const identifiers = Array.from(bookList.values())
      .map(book => book.identifier)
      .filter((id): id is BookIdentifier => !!id && openBdProvider.supportsIdentifier(id));

    if (identifiers.length === 0) {
      return Array.from(bookList.values()).map(book => ({
        book,
        isFound: false
      }));
    }

    try {
      this.logger.info(`OpenBDで${identifiers.length}冊を一括取得中...`);
      
      const bulkResult = await openBdProvider.fetchBulkBookInfo(identifiers);
      
      if (!bulkResult.isSuccess()) {
        this.logger.error(`OpenBD一括取得でエラー: ${bulkResult.unwrapError().message}`);
        return Array.from(bookList.values()).map(book => ({
          book,
          isFound: false
        }));
      }

      const bookInfoMap = bulkResult.unwrap();
      const results: BookSearchState[] = [];

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

      this.logger.info(`OpenBDで${results.filter(r => r.isFound).length}冊が見つかりました`);
      return results;
    } catch (error) {
      this.logger.error(`OpenBD一括取得中にエラー: ${error instanceof Error ? error.message : String(error)}`);
      return Array.from(bookList.values()).map(book => ({
        book,
        isFound: false
      }));
    }
  }

  /**
   * 個別APIでの検索（OpenBDで見つからなかった書籍のみ）
   * 地域別優先順序を適用
   */
  private async fetchWithSingleRequestAPIs(searchState: BookSearchState, signal?: AbortSignal): Promise<BookSearchState> {
    const { book } = searchState;
    
    if (!book.identifier || isAsin(book.identifier)) {
      return searchState; // ASINは個別APIでは処理しない
    }

    this.logger.debug(`個別API検索: ${book.title}`, {
      identifier: book.identifier
    });

    let enhancedBook = book;
    let isFound = false;

    // 地域別優先順序でプロバイダーを取得
    const prioritizedProviders = this.getPrioritizedProvidersForRegion(book.identifier);

    // 各プロバイダーを順番に試す
    for (const provider of prioritizedProviders) {
      if (signal?.aborted) {
        throw new Error("処理がキャンセルされました");
      }

      // OpenBDは既に試したのでスキップ
      if (provider instanceof OpenBDProvider) {
        continue;
      }

      try {
        const result = await provider.enhanceBook(enhancedBook);

        if (result.isSuccess()) {
          enhancedBook = result.unwrap();
          isFound = true;
          this.logger.debug(`${provider.getSourceName()}で書籍情報を取得: ${enhancedBook.title}`);
          break; // 見つかったら終了
        } else {
          const error = result.unwrapError();
          if (error.statusCode !== 404) {
            this.logger.debug(`${provider.getSourceName()}でエラー: ${error.message}`);
          }
        }
      } catch (error) {
        this.logger.debug(`${provider.getSourceName()}で予期せぬエラー: ${error instanceof Error ? error.message : String(error)}`);
      }

      await sleep(randomWait(1500, 0.8, 1.2));
    }

    return {
      book: enhancedBook,
      isFound
    };
  }

  /**
   * 地域別優先順序でプロバイダーを取得
   * 和書: NDL → ISBNdb → GoogleBooks
   * 洋書: ISBNdb → NDL → GoogleBooks
   */
  private getPrioritizedProvidersForRegion(identifier: BookIdentifier): readonly BiblioInfoProvider[] {
    const supportedProviders = this.providers.filter(provider => 
      provider.supportsIdentifier(identifier)
    );

    const region = this.routeByRegion(identifier);
    
    if (region === "Japan") {
      // 和書: NDL → ISBNdb → GoogleBooks
      return supportedProviders.sort((a, b) => {
        const aName = a.getSourceName();
        const bName = b.getSourceName();
        
        if (aName === "NDL" && bName !== "NDL") return -1;
        if (aName !== "NDL" && bName === "NDL") return 1;
        if (aName === "ISBNdb" && bName === "GoogleBooks") return -1;
        if (aName === "GoogleBooks" && bName === "ISBNdb") return 1;
        
        return 0;
      });
    } else {
      // 洋書: ISBNdb → NDL → GoogleBooks
      return supportedProviders.sort((a, b) => {
        const aName = a.getSourceName();
        const bName = b.getSourceName();
        
        if (aName === "ISBNdb" && bName !== "ISBNdb") return -1;
        if (aName !== "ISBNdb" && bName === "ISBNdb") return 1;
        if (aName === "NDL" && bName === "GoogleBooks") return -1;
        if (aName === "GoogleBooks" && bName === "NDL") return 1;
        
        return 0;
      });
    }
  }

  /**
   * 識別子に適したプロバイダーを優先順に取得（レガシー）
   */
  private getPrioritizedProviders(identifier: BookIdentifier): readonly BiblioInfoProvider[] {
    const supportedProviders = this.providers.filter((provider) => provider.supportsIdentifier(identifier));
    return supportedProviders.sort((a, b) => b.getPriority(identifier) - a.getPriority(identifier));
  }

  /**
   * 書籍に対して適切なプロバイダーを使用して書誌情報を取得（レガシー）
   */
  private async enhanceBookWithProviders(book: Book, signal?: AbortSignal): Promise<Book> {
    if (!book.identifier) {
      return book;
    }

    const providers = this.getPrioritizedProviders(book.identifier);
    let enhancedBook = book;

    for (const provider of providers) {
      if (signal?.aborted) {
        throw new Error("処理がキャンセルされました");
      }

      try {
        const result = await provider.enhanceBook(enhancedBook);

        if (result.isSuccess()) {
          enhancedBook = result.unwrap();
          break;
        }
      } catch (error) {
        // エラーは無視して次のプロバイダーを試す
      }

      await sleep(randomWait(300, 0.7, 1.3));
    }

    return enhancedBook;
  }

  /**
   * 日本語書籍か海外書籍かに基づいてルーティング
   */
  routeByRegion(identifier: BookIdentifier): "Japan" | "Others" {
    if (isAsin(identifier)) {
      return "Others";
    }

    if (isIsbn10(identifier)) {
      return routeIsbn10(identifier);
    }

    return "Others";
  }
}
