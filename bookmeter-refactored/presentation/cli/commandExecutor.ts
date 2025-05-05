import { TYPES } from "../di/types";

import type { Logger } from "../../application/ports/output/logger";
import type { DIContainer } from "../di/container";
import type {
  CrawlBookDescriptionUseCase,
  FetchBiblioInfoUseCase,
  GetBookListUseCase,
  SaveBookListUseCase
} from "../di/types";

/**
 * コマンド実行時のオプション
 */
export interface CommandOptions {
  userId?: string;
  noRemoteCheck?: boolean;
  skipBookListComparison?: boolean;
  skipFetchingBiblioInfo?: boolean;
  outputFilePath?: string | null;
}

/**
 * コマンドライン引数に基づいてコマンドを実行する
 *
 * @param container 依存性注入コンテナ
 * @param mode 実行モード（"wish" または "stacked"）
 * @param options コマンドオプション
 */
export async function executeCommand(
  container: DIContainer,
  mode: "wish" | "stacked",
  options: Record<string, unknown>
): Promise<void> {
  // 依存関係の解決
  const logger = container.get<Logger>(TYPES.Logger);
  const getBookListUseCase = container.get<GetBookListUseCase>(TYPES.GetBookListUseCase);
  const fetchBiblioInfoUseCase = container.get<FetchBiblioInfoUseCase>(TYPES.FetchBiblioInfoUseCase);
  const saveBookListUseCase = container.get<SaveBookListUseCase>(TYPES.SaveBookListUseCase);
  const crawlBookDescriptionUseCase = container.get<CrawlBookDescriptionUseCase>(TYPES.CrawlBookDescriptionUseCase);

  // オプションのキャスト（型安全のため）
  const commandOptions: CommandOptions = {
    userId: typeof options.userId === "string" ? options.userId : undefined,
    noRemoteCheck: options.noRemoteCheck === true,
    skipBookListComparison: options.skipBookListComparison === true,
    skipFetchingBiblioInfo: options.skipFetchingBiblioInfo === true,
    outputFilePath: typeof options.outputFilePath === "string" ? options.outputFilePath : null
  };

  // 処理の開始をログに記録
  logger.info(`${mode === "wish" ? "読みたい本" : "積読本"}リストの処理を開始します`);

  try {
    // 1. 書籍リストの取得
    logger.info("書籍リストを取得しています");
    const bookList = await getBookListUseCase.execute({
      type: mode,
      userId: commandOptions.userId,
      skipRemoteCheck: commandOptions.noRemoteCheck,
      skipComparison: commandOptions.skipBookListComparison,
      outputFilePath: commandOptions.outputFilePath
    });

    // 2. 変更があったかチェック
    if (bookList.hasChanges) {
      logger.info("書籍リストに変更があります");

      // 3. 書誌情報の取得（オプションによりスキップ可能）
      let enrichedBookList = bookList.books;
      if (!commandOptions.skipFetchingBiblioInfo) {
        logger.info("書誌情報を取得しています");
        enrichedBookList = await fetchBiblioInfoUseCase.execute(bookList.books);
      } else {
        logger.info("書誌情報の取得をスキップします");
      }

      // 4. 書籍の詳細情報（あらすじ・目次）を取得
      logger.info("書籍の詳細情報をクロールしています");
      await crawlBookDescriptionUseCase.execute(enrichedBookList, mode);

      // 5. データの保存とエクスポート
      logger.info("データを保存しています");
      await saveBookListUseCase.execute(enrichedBookList, mode, commandOptions.outputFilePath);

      logger.info("処理が正常に完了しました");
    } else {
      logger.info("書籍リストに変更はありません。処理を終了します");
    }
  } catch (error) {
    logger.error(`処理中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
