import type { Logger } from "../ports/output/logger";
import type { BookList } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors";
import type { BiblioInfoService } from "@/infrastructure/adapters/apis/types";

/**
 * 書誌情報を取得するユースケース
 */
export function createFetchBiblioInfoUseCase(
  biblioInfoService: BiblioInfoService,
  logger: Logger
): { execute: (bookList: BookList, signal?: AbortSignal) => Promise<BookList> } {
  async function execute(bookList: BookList, signal?: AbortSignal): Promise<BookList> {
    logger.info(`書誌情報の取得を開始します（${bookList.size}冊）`);

    try {
      // キャンセルチェック
      if (signal?.aborted) {
        const error: AppError = {
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        };
        throw error;
      }

      // BiblioInfoServiceを使用して書籍情報を一括取得
      return await biblioInfoService.fetchBiblioInfo(bookList, signal);
    } catch (thrownError) {
      // キャンセルエラーの場合
      if (signal?.aborted) {
        const error: AppError = {
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        };
        throw error;
      }

      // AppErrorが投げられた場合
      if (thrownError && typeof thrownError === "object" && "name" in thrownError && thrownError.name === "AppError") {
        const appError = thrownError as AppError;
        logger.error(`書誌情報の取得中にエラーが発生しました: ${appError.message}`, { error: appError });
        throw appError; // そのまま再スロー
      }

      // その他の予期せぬエラー
      const message = thrownError instanceof Error ? thrownError.message : String(thrownError);
      logger.error(`書誌情報の取得中に予期しないエラーが発生しました: ${message}`, { error: thrownError });

      const error: AppError = {
        message: `書誌情報の取得中に予期しないエラーが発生しました: ${message}`,
        code: "UNKNOWN",
        name: "AppError",
        cause: thrownError
      };
      throw error;
    }
  }

  // 公開関数を返す
  return {
    execute
  };
}
