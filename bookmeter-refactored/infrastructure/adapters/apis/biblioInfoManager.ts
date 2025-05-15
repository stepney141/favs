import { PromiseQueue, sleep, randomWait } from "../../utils/apiUtils";

import type { BiblioInfoProvider } from "@/application/ports/output/biblioInfoProvider";
import type { Book, BookList } from "@/domain/models/book";
import type { BookIdentifier } from "@/domain/models/valueObjects";

import { isAsin, isIsbn10, routeIsbn10 } from "@/domain/services/isbnService";

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
   */
  async fetchBiblioInfo(bookList: BookList, signal?: AbortSignal): Promise<BookList> {
    this.logger.info(`書誌情報の取得を開始します（${bookList.size}冊）`);

    try {
      // キャンセル確認
      if (signal?.aborted) {
        throw new Error("処理がキャンセルされました");
      }

      const enhancedBooks = new Map<string, Book>();

      // 一度に処理する最大並列数
      const CONCURRENCY = 5;

      // プロミスキューの作成
      const queue = PromiseQueue();

      // 各書籍に対して処理を追加
      for (const [url, book] of bookList.entries()) {
        queue.add(() => this.enhanceBookWithProviders(book, signal));

        // 指定数の並列処理を実行
        const result = await queue.wait(CONCURRENCY);
        if (result !== false) {
          enhancedBooks.set(url, result as Book);
        }

        // ランダムな待機
        await sleep(randomWait(500, 0.8, 1.2));

        // キャンセル確認
        if (signal?.aborted) {
          throw new Error("処理がキャンセルされました");
        }
      }

      // 残りの処理を完了
      const remainingResults = (await queue.all()) as Book[];

      // 残りの結果を追加
      for (const result of remainingResults) {
        if (result.url) {
          enhancedBooks.set(result.url, result);
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
   * 識別子に適したプロバイダーを優先順に取得
   */
  private getPrioritizedProviders(identifier: BookIdentifier): BiblioInfoProvider[] {
    // 識別子をサポートするプロバイダーのみをフィルター
    const supportedProviders = this.providers.filter((provider) => provider.supportsIdentifier(identifier));

    // 優先度でソート
    return supportedProviders.sort((a, b) => b.getPriority(identifier) - a.getPriority(identifier));
  }

  /**
   * 書籍に対して適切なプロバイダーを使用して書誌情報を取得
   */
  private async enhanceBookWithProviders(book: Book, signal?: AbortSignal): Promise<Book> {
    if (!book.identifier) {
      return book; // 識別子がない場合は何もせず返す
    }

    this.logger.debug(`書籍を処理しています: ${book.title}`, {
      url: book.url,
      identifier: book.identifier
    });

    // 優先順にソートされたプロバイダーを取得
    const providers = this.getPrioritizedProviders(book.identifier);

    let enhancedBook = book;

    // 各プロバイダーを試す
    for (const provider of providers) {
      // キャンセル確認
      if (signal?.aborted) {
        throw new Error("処理がキャンセルされました");
      }

      try {
        const result = await provider.enhanceBook(enhancedBook);

        if (result.isSuccess()) {
          enhancedBook = result.unwrap();
          this.logger.debug(`${provider.getSourceName()}から書籍情報を取得しました`, {
            title: enhancedBook.title,
            provider: provider.getSourceName()
          });

          // 一旦情報が取得できたら終了
          // 必要に応じて、全てのプロバイダーから情報を集める方式に変更可能
          break;
        } else {
          const error = result.unwrapError();
          // 404エラーは無視する（別のプロバイダーで検索継続）
          if (error.statusCode !== 404) {
            this.logger.debug(`${provider.getSourceName()}からの取得でエラー: ${error.message}`, {
              error,
              provider: provider.getSourceName()
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.debug(`${provider.getSourceName()}からの取得で予期せぬエラー: ${message}`, {
          error,
          provider: provider.getSourceName()
        });
      }

      // 各プロバイダー間で短い待機
      await sleep(randomWait(300, 0.7, 1.3));
    }

    return enhancedBook;
  }

  /**
   * 日本語書籍か海外書籍かに基づいてルーティング
   */
  routeByRegion(identifier: BookIdentifier): "Japan" | "Others" {
    if (isAsin(identifier)) {
      return "Others"; // ASINはデフォルトで海外扱い
    }

    if (isIsbn10(identifier)) {
      return routeIsbn10(identifier);
    }

    // ISBN13またはその他の場合はデフォルト
    return "Others";
  }
}
