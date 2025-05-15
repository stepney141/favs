import type { BookRepository } from "../ports/output/bookRepository";
import type { BookScraperService } from "../ports/output/bookScraperService";
import type { Logger } from "../ports/output/logger";
import type { Book, BookList, BookListType } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors";
import type { Result } from "@/domain/models/result";
import type { ISBN10 } from "@/domain/models/valueObjects";

import { ok, err } from "@/domain/models/result";
import { isIsbn10, isAsin } from "@/domain/services/isbnService";

export interface CrawlBookDescriptionParams {
  bookList?: BookList;
  type: BookListType;
  signal?: AbortSignal;
}

/**
 * 書籍の説明を取得するユースケース
 * 紀伊國屋書店のウェブサイトから書籍の説明を取得する
 */
export function createCrawlBookDescriptionUseCase(
  bookRepository: BookRepository,
  bookScraperService: BookScraperService,
  logger: Logger
): { execute: (params: CrawlBookDescriptionParams) => Promise<Result<AppError, void>> } {
  /**
   * 実行
   */
  async function execute(params: CrawlBookDescriptionParams): Promise<Result<AppError, void>> {
    const { bookList, type, signal } = params;

    logger.info(`書籍説明の取得を開始します (${type})`, {
      hasBookList: !!bookList,
      type
    });

    try {
      // キャンセルチェック
      if (signal?.aborted) {
        return err({
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        });
      }

      // 書籍リストの取得
      let booksToProcess: BookList;

      if (bookList) {
        // パラメータから指定された書籍リストを使用
        booksToProcess = bookList;
      } else {
        // データベースから書籍リストを取得
        logger.info(`データベースから${type}の書籍リストを取得します`);
        const loadResult = await bookRepository.findAll(type);

        if (loadResult.isError()) {
          const error = loadResult.unwrapError();
          logger.error(`データベースからの書籍リスト取得に失敗しました: ${error.message}`, { error });
          return err(error);
        }

        booksToProcess = loadResult.unwrap();
        logger.info(`${booksToProcess.size}冊の書籍を取得しました`);
      }

      // 説明がない書籍を抽出
      const booksNeedingDescription: [string, Book][] = [];

      for (const [url, book] of booksToProcess.entries()) {
        // ISBN10のみを処理対象とする（ASINはスキップ）
        const id = book.identifier;

        if (!id || !isIsbn10(id) || isAsin(id)) {
          continue;
        }

        // キャンセルチェック
        if (signal?.aborted) {
          return err({
            message: "処理がキャンセルされました",
            code: "CANCELLED",
            name: "AppError"
          });
        }

        // データベースに既に説明があるか確認
        const hasDescriptionResult = await bookRepository.hasDescription(book.id);

        if (hasDescriptionResult.isError()) {
          const error = hasDescriptionResult.unwrapError();
          logger.warn(`説明の確認に失敗しました: ${error.message}`, {
            error,
            isbn: id,
            title: book.title
          });
          continue; // エラーは記録して次の書籍へ
        }

        const hasDescription = hasDescriptionResult.unwrap();

        if (!hasDescription) {
          // 説明が存在しない場合、取得対象リストに追加
          booksNeedingDescription.push([url, book]);
        }
      }

      logger.info(`${booksNeedingDescription.length}冊の書籍の説明を取得します`);

      // 説明の取得と保存
      for (const [, book] of booksNeedingDescription) {
        // キャンセルチェック
        if (signal?.aborted) {
          return err({
            message: "処理がキャンセルされました",
            code: "CANCELLED",
            name: "AppError"
          });
        }

        const isbn = book.identifier as ISBN10;
        logger.debug(`書籍「${book.title}」の説明を取得します (ISBN: ${isbn})`);

        // 紀伊國屋書店から説明を取得
        const descriptionResult = await bookScraperService.scrapeBookDescription(isbn);

        if (descriptionResult.isError()) {
          const error = descriptionResult.unwrapError();
          logger.warn(`書籍「${book.title}」の説明取得に失敗しました: ${error.message}`, {
            error,
            isbn,
            title: book.title
          });
          continue; // エラーは記録して次の書籍へ
        }

        const description = descriptionResult.unwrap();

        // 説明の保存
        if (description.trim() !== "") {
          const updateResult = await bookRepository.updateDescription(book.id, description);

          if (updateResult.isError()) {
            const error = updateResult.unwrapError();
            logger.warn(`書籍「${book.title}」の説明保存に失敗しました: ${error.message}`, {
              error,
              isbn,
              title: book.title
            });
          } else {
            logger.debug(`書籍「${book.title}」の説明を保存しました (${description.length}文字)`);
          }
        } else {
          logger.debug(`書籍「${book.title}」の説明は空でした`);
        }
      }

      logger.info(`書籍説明の取得が完了しました: ${booksNeedingDescription.length}冊処理`);
      return ok(undefined);
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
      logger.error(`書籍説明の取得中にエラーが発生しました: ${message}`, { error, type });

      return err({
        message: `書籍説明の取得中にエラーが発生しました: ${message}`,
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
