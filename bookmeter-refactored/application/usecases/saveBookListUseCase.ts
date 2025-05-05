import { ok, err } from "../../domain/models/result";

import type { BookList, BookListType } from "../../domain/models/book";
import type { AppError } from "../../domain/models/errors";
import type { Result } from "../../domain/models/result";
import type { BookRepository } from "../ports/output/bookRepository";
import type { Logger } from "../ports/output/logger";
import type { StorageService } from "../ports/output/storageService";

export interface SaveBookListParams {
  bookList: BookList;
  type: BookListType;
  exportToCsv?: boolean;
  uploadToCloud?: boolean;
  signal?: AbortSignal;
}

/**
 * 書籍リストを保存するユースケース
 */
export function createSaveBookListUseCase(
  bookRepository: BookRepository,
  storageService: StorageService,
  logger: Logger
): { execute: (params: SaveBookListParams) => Promise<Result<AppError, void>> } {
  /**
   * 実行
   */
  async function execute(params: SaveBookListParams): Promise<Result<AppError, void>> {
    const { bookList, type, exportToCsv = true, uploadToCloud = false, signal } = params;

    logger.info(`書籍リスト(${type})の保存を開始します。${bookList.size}冊`, {
      type,
      exportToCsv,
      uploadToCloud
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

      // データベースに保存
      logger.info("データベースに保存します...");
      const saveResult = await bookRepository.save(bookList, type);

      if (saveResult.isError()) {
        const error = saveResult.unwrapError();
        logger.error(`データベースへの保存に失敗しました: ${error.message}`, { error });
        return err(error);
      }

      logger.info("データベースへの保存が完了しました");

      // CSVへのエクスポート
      if (exportToCsv) {
        // キャンセルチェック
        if (signal?.aborted) {
          return err({
            message: "処理がキャンセルされました",
            code: "CANCELLED",
            name: "AppError"
          });
        }

        logger.info("CSVにエクスポートします...");
        // exportBookListの第二引数 filePath はオプショナルなので省略
        // 第三引数 "csv" は不要になったため削除
        const exportResult = await storageService.exportBookList(type);

        if (exportResult.isError()) {
          const error = exportResult.unwrapError();
          logger.error(`CSVエクスポートに失敗しました: ${error.message}`, { error });
          // エクスポートの失敗はクリティカルではないため、エラーを記録して続行
        } else {
          const exportPath = exportResult.unwrap(); // exportBookListはファイルパスを返すようになった
          logger.info(`CSVエクスポートが完了しました: ${exportPath}`); // 正しいパスをログに出力
        }
      }

      // クラウドへのアップロード
      if (uploadToCloud) {
        // キャンセルチェック
        if (signal?.aborted) {
          return err({
            message: "処理がキャンセルされました",
            code: "CANCELLED",
            name: "AppError"
          });
        }

        logger.info("データベースをクラウドストレージにアップロードします...");
        const uploadResult = await storageService.uploadDatabaseToCloud();

        if (uploadResult.isError()) {
          const error = uploadResult.unwrapError();
          logger.error(`クラウドへのアップロードに失敗しました: ${error.message}`, { error });
          // アップロードの失敗はクリティカルではないため、エラーを記録して続行
        } else {
          logger.info("クラウドへのアップロードが完了しました");
        }
      }

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
      logger.error(`書籍リスト(${type})の保存中にエラーが発生しました: ${message}`, { error, type });

      return err({
        message: `書籍リスト(${type})の保存中にエラーが発生しました: ${message}`,
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
