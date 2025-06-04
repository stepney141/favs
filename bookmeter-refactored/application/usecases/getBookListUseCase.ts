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
  source: "remote" | "local";
  processing: "smart" | "force" | "skip";
  outputFilePath?: string | null;
  signal?: AbortSignal;
}

/**
 * データベースとWeb上の書籍リストの差分を確認する
 */
function hasChanges(storedBooks: Readonly<BookList>, scrapedBooks: Readonly<BookList>): boolean {
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
 * 書籍リスト（読みたい本・積読本）を取得するユースケース
 */
export function createGetBookListUseCase(
  bookRepository: BookRepository,
  bookScraperService: BookScraperService,
  logger: Logger
): {
  execute: (params: GetBookListParams) => Promise<Result<{ books: BookList; hasChanges: boolean }, AppError>>;
} {
  /**
   * 実行
   */
  async function execute(
    params: Readonly<GetBookListParams>
  ): Promise<Result<{ books: BookList; hasChanges: boolean }, AppError>> {
    const { userId, type, source, processing, signal, outputFilePath } = params;

    logger.info(`書籍リスト(${type})の取得を開始します`, { userId, type, source, processing, outputFilePath });

    try {
      // キャンセルチェック
      if (signal?.aborted) {
        return err({
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        });
      }

      // 1. データソースに基づいて書籍リストを取得
      let currentBookList: BookList;
      if (source === "local") {
        logger.info(`ローカルデータベースから書籍リスト(${type})を取得します`);
        const storedBooksResult = await bookRepository.findAll(type);
        if (storedBooksResult.isError()) {
          const error = storedBooksResult.unwrapError();
          logger.error("ローカルデータベースからの書籍リスト取得に失敗しました。", { error });
          return err(error);
        }
        currentBookList = storedBooksResult.unwrap();
        if (currentBookList.size === 0 && processing !== "force") {
          // ローカル指定だがデータがない場合、かつforceでない場合は、
          // リモートから取得するフォールバックも考えられるが、
          // ここではCLIの指示通りローカル取得失敗として扱う。
          // forceの場合は空のリストで後続処理に進む（比較で全件新規扱いになる）
          logger.warn("ローカルデータベースに書籍データが存在しません。");
          // processing === 'skip' の場合はこの後すぐにリターンするので問題ない
        }
        logger.info(`ローカルデータベースから${currentBookList.size}冊の書籍を取得しました`, { type });
      } else {
        // source === "remote"
        logger.info(`Bookmeterから書籍リスト(${type})を取得します`, { userId });
        const scrapeResult =
          type === "wish"
            ? await bookScraperService.getWishBooks(userId, true, signal)
            : await bookScraperService.getStackedBooks(userId, signal);

        if (scrapeResult.isError()) {
          return err(scrapeResult.unwrapError());
        }
        currentBookList = scrapeResult.unwrap();
        logger.info(`Bookmeterから${currentBookList.size}冊の書籍を取得しました`, { type });
      }

      // キャンセルチェック
      if (signal?.aborted) {
        return err({ message: "処理がキャンセルされました", code: "CANCELLED", name: "AppError" });
      }

      // 2. processing モードに基づいて hasChanges を決定
      let determinedHasChanges: boolean;

      if (processing === "skip") {
        logger.info("処理モード 'skip': 差分チェックを行わず、変更なしとして扱います。");
        determinedHasChanges = false;
        return ok({ books: currentBookList, hasChanges: determinedHasChanges });
      }

      if (processing === "force") {
        logger.info("処理モード 'force': 差分チェックの結果に関わらず、変更ありとして扱います。");
        determinedHasChanges = true;
        // force の場合でも、比較自体はログやデバッグのために行うこともできるが、
        // ここでは hasChanges を true に設定して返す
        return ok({ books: currentBookList, hasChanges: determinedHasChanges });
      }

      // processing === "smart" の場合 (これがデフォルトの比較処理)
      const storedBooksResult = await bookRepository.findAll(type);
      if (storedBooksResult.isError()) {
        // DBからの取得に失敗した場合、比較対象がないため、
        // リモートから取得したものは全て新規とみなし、変更ありとする
        const error = storedBooksResult.unwrapError();
        logger.warn("比較対象のローカル書籍リストの取得に失敗しました。リモート取得結果を全て新規として扱います。", {
          error
        });
        determinedHasChanges = currentBookList.size > 0; // リモートに1件でもあれば変更あり
      } else {
        const storedBooks = storedBooksResult.unwrap();
        determinedHasChanges = hasChanges(storedBooks, currentBookList);
        if (determinedHasChanges) {
          logger.info(`データベースとの差分を検出しました。更新が必要です`, { type });
        } else {
          logger.info(`データベースとの差分はありません`, { type });
        }
      }
      return ok({ books: currentBookList, hasChanges: determinedHasChanges });
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
