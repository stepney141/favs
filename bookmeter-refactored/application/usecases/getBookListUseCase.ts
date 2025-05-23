import type { BookRepository } from "../ports/output/bookRepository";
import type { BookScraperService } from "../ports/output/bookScraperService";
import type { Logger } from "@/application/ports/output/logger";
import type { BookList, BookListType } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors";
import type { Result } from "@/domain/models/result";

import { ok, err } from "@/domain/models/result";

export interface GetBookListParams {
  userId: string;
  type: BookListType;
  refresh?: boolean; // Ensure this line exists or add it
  signal?: AbortSignal;
  // Add other potential missing properties if needed based on commandExecutor.ts call
  skipRemoteCheck?: boolean; // Added based on commandExecutor call
  skipComparison?: boolean; // Added based on commandExecutor call
  outputFilePath?: string | null; // Added based on commandExecutor call
}

/**
 * 書籍リスト（読みたい本・積読本）を取得するユースケース
 */
export function createGetBookListUseCase(
  bookRepository: BookRepository,
  bookScraperService: BookScraperService,
  logger: Logger
): {
  execute: (params: GetBookListParams) => Promise<Result<AppError, { books: BookList; hasChanges: boolean }>>;
} {
  /**
   * データベースとWeb上の書籍リストの差分を確認する
   */
  function hasChanges(storedBooks: BookList, scrapedBooks: BookList): boolean {
    // サイズが異なれば変更あり
    if (storedBooks.size !== scrapedBooks.size) {
      return true;
    }

    // URLの一致チェック
    const storedUrls = new Set(storedBooks.keys());
    const scrapedUrls = new Set(scrapedBooks.keys());

    // 同じURLセットかチェック
    const urlDiff = new Set(
      [...storedUrls]
        .filter((url) => !scrapedUrls.has(url))
        .concat([...scrapedUrls].filter((url) => !storedUrls.has(url)))
    );

    // URLセットが異なれば変更あり
    if (urlDiff.size > 0) {
      return true;
    }

    // 同じURLでも内容が変わっている可能性があるのでチェック
    for (const [url, scrapedBook] of scrapedBooks.entries()) {
      const storedBook = storedBooks.get(url);
      if (!storedBook) continue; // ここには到達しないはずだが、型安全のため

      // ISBNが変わっていたら変更あり
      if (storedBook.identifier !== scrapedBook.identifier) {
        return true;
      }
    }

    return false;
  }

  /**
   * 実行
   */
  async function execute(
    params: GetBookListParams
  ): Promise<Result<AppError, { books: BookList; hasChanges: boolean }>> {
    const { userId, type, refresh = false, signal } = params;

    logger.info(`書籍リスト(${type})の取得を開始します`, { ...params });

    try {
      // キャンセルチェック
      if (signal?.aborted) {
        return err({
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        });
      }

      // リフレッシュが不要かつデータベースにデータがある場合は、データベースから取得
      if (!refresh) {
        const storedBooksResult = await bookRepository.findAll(type);

        if (storedBooksResult.isSuccess()) {
          const storedBooks = storedBooksResult.unwrap();

          if (storedBooks.size > 0) {
            logger.info(`データベースから${storedBooks.size}冊の書籍を取得しました`, { type });
            // DBキャッシュから返す場合は変更なし
            return ok({ books: storedBooks, hasChanges: false });
          }
        } else {
          // データベースからの取得に失敗した場合はログに記録
          const error = storedBooksResult.unwrapError();
          logger.warn(`データベースからの取得に失敗しました: ${error.message}`, { error });
          // エラーはログに記録するが処理は継続（Webから取得を試みる）
        }
      }

      // ウェブからスクレイピングして取得
      logger.info(`Bookmeterから書籍リスト(${type})を取得します`, { userId });

      const scrapeResult =
        type === "wish"
          ? await bookScraperService.getWishBooks(userId, true, signal) // ログイン状態で取得（デフォルト）
          : await bookScraperService.getStackedBooks(userId, signal);

      if (scrapeResult.isError()) {
        return err(scrapeResult.unwrapError());
      }

      const scrapedBooks = scrapeResult.unwrap();
      logger.info(`Bookmeterから${scrapedBooks.size}冊の書籍を取得しました`, { type });

      // データベースのデータとの差分チェック
      const storedBooksResult = await bookRepository.findAll(type);
      let changes = false;

      if (storedBooksResult.isSuccess()) {
        const storedBooks = storedBooksResult.unwrap();
        changes = hasChanges(storedBooks, scrapedBooks); // Assign value inside

        if (changes) {
          logger.info(`データベースとの差分を検出しました。更新が必要です`, { type });
        } else {
          logger.info(`データベースとの差分はありません`, { type });
        }
      } else {
        // DBからの取得に失敗した場合でも、スクレイピング結果はあるので変更ありとみなす
        changes = true;
        logger.warn(
          "データベースの書籍リストを取得できなかったため、差分チェックをスキップします。強制的に更新します。",
          { type }
        );
      }

      return ok({ books: scrapedBooks, hasChanges: changes });
    } catch (error) {
      // キャンセルエラーの場合
      if (signal?.aborted) {
        return err({
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        });
      }

      // その他のエラー
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`書籍リスト(${type})の取得中にエラーが発生しました: ${message}`, { error, userId, type });

      return err({
        message: `書籍リスト(${type})の取得中にエラーが発生しました: ${message}`,
        code: "UNKNOWN",
        name: "AppError",
        cause: error
      });
    }
  }

  // 公開関数を返す
  return {
    execute
  };
}
