import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { TYPES } from "../di/types";

import { BOOKMETER_USER_ID } from "./constants";

import type { DIContainer } from "../di/container";
import type {
  CrawlBookDescriptionUseCase,
  FetchBiblioInfoUseCase,
  GetBookListUseCase,
  SaveBookListUseCase
} from "../di/types";
import type { Logger } from "@/application/ports/output/logger";

type Mode = "wish" | "stacked";
interface CliOptions {
  userId: string;
  outputFilePath?: string;
  source: "remote" | "local";
  processing: "smart" | "force" | "skip";
  "biblio-fetching": "enabled" | "disabled";
  [key: string]: unknown; // yargsが他のプロパティを追加する可能性があるため
}

/**
 * コマンド実行時のオプション
 */
export interface CommandOptions {
  userId?: string;
  refresh?: boolean;
  noRemoteCheck?: boolean;
  skipBookListComparison?: boolean;
  skipFetchingBiblioInfo?: boolean;
  outputFilePath?: string | null;
}

/**
 * コマンドライン引数を解析する
 */
export async function parseCliArguments(argv: string[]): Promise<{ mode: Mode; options: CliOptions }> {
  const parsedArgs = await yargs(hideBin(argv))
    .command<CliOptions>("$0 <mode>", "Bookmeterの書籍リストを取得・処理します。", (yargsInstance) => {
      return yargsInstance.positional("mode", {
        describe: "処理モード(積読/読みたい本)",
        type: "string",
        choices: ["wish", "stacked"] as const,
        demandOption: true
      });
    })
    .option("userId", {
      alias: "u",
      type: "string",
      description: "BookmeterのユーザーID",
      default: BOOKMETER_USER_ID.stepney141
    })
    .option("outputFilePath", {
      alias: "o",
      type: "string",
      description: "出力ファイルのカスタムパス"
    })
    .option("source", {
      type: "string",
      description: "書籍リストの取得元(リモートbookmeter or ローカルDB)",
      choices: ["remote", "local"] as const,
      default: "remote"
    })
    .option("processing", {
      type: "string",
      description: [
        "取得した書籍リストの処理戦略:",
        "  smart: 前回のリストと比較し変更がある場合のみ処理",
        "  force: 変更の有無に関わらず強制的に処理",
        "  skip:  書籍リスト取得後、一切のデータ処理をスキップ"
      ].join("\n"),
      choices: ["smart", "force", "skip"] as const,
      default: "smart"
    })
    .option("biblio-fetching", {
      type: "string",
      description: "書誌情報を外部APIから取得するかどうか",
      choices: ["enabled", "disabled"] as const,
      default: "enabled"
    })
    .help()
    .alias("help", "h")
    .strict()
    .wrap(null).argv;

  // parsedArgs.mode は yargs によって string | undefined と推論されることがあるため、
  // 明示的に Mode 型にキャストする。 positional で demandOption: true としているので、
  // 実際には undefined になることはない。
  const mode = parsedArgs.mode as Mode;

  // yargsが返すparsedArgsには、位置引数(mode)や特殊なプロパティ(_ や $0)も含まれるため、
  // CliOptionsに定義されたプロパティのみを抽出する。
  const options = {
    userId: parsedArgs.userId,
    outputFilePath: parsedArgs.outputFilePath,
    source: parsedArgs.source as "remote" | "local",
    processing: parsedArgs.processing as "smart" | "force" | "skip",
    "biblio-fetching": parsedArgs["biblio-fetching"] as "enabled" | "disabled"
  } satisfies CliOptions;

  return { mode, options };
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
  // userIdのチェック: optionsオブジェクトから直接userIdを取得して検証
  if (typeof options.userId !== "string" || options.userId.trim() === "") {
    throw new Error("User ID is required and must be a non-empty string.");
  }

  // 依存関係の解決
  const logger = container.get<Logger>(TYPES.Logger);
  const getBookListUseCase = container.get<GetBookListUseCase>(TYPES.GetBookListUseCase);
  const fetchBiblioInfoUseCase = container.get<FetchBiblioInfoUseCase>(TYPES.FetchBiblioInfoUseCase);
  const saveBookListUseCase = container.get<SaveBookListUseCase>(TYPES.SaveBookListUseCase);
  const crawlBookDescriptionUseCase = container.get<CrawlBookDescriptionUseCase>(TYPES.CrawlBookDescriptionUseCase);

  // オプションのキャスト（型安全のため）
  const commandOptions: CommandOptions = {
    userId: options.userId,
    noRemoteCheck: options.noRemoteCheck === true,
    skipBookListComparison: options.skipBookListComparison === true,
    skipFetchingBiblioInfo: options.skipFetchingBiblioInfo === true,
    outputFilePath: typeof options.outputFilePath === "string" ? options.outputFilePath : null,
    refresh: options.refresh === true
  };

  // 処理の開始をログに記録
  logger.info(`${mode === "wish" ? "読みたい本" : "積読本"}リストの処理を開始します`);

  try {
    // 1. 書籍リストの取得
    logger.info("書籍リストを取得しています");
    const bookListResult = await getBookListUseCase.execute({
      // 変数名を変更
      type: mode,
      userId: commandOptions.userId,
      refresh: commandOptions.refresh,
      skipRemoteCheck: commandOptions.noRemoteCheck,
      skipComparison: commandOptions.skipBookListComparison,
      outputFilePath: commandOptions.outputFilePath
    });

    // エラーチェック
    if (bookListResult.isError()) {
      throw bookListResult.unwrapError(); // エラーがあれば再スロー
    }

    // 結果を展開
    const { books, hasChanges } = bookListResult.unwrap();

    // 2. 変更があったかチェック
    if (hasChanges) {
      // 取得した hasChanges フラグを使用
      logger.info("書籍リストに変更があります");

      // 3. 書誌情報の取得（オプションによりスキップ可能）
      let enrichedBookList = books; // 展開した books を使用
      if (!commandOptions.skipFetchingBiblioInfo) {
        logger.info("書誌情報を取得しています");
        enrichedBookList = await fetchBiblioInfoUseCase.execute(books); // 展開した books を使用
      } else {
        logger.info("書誌情報の取得をスキップします");
      }

      // 4. 書籍の詳細情報（あらすじ・目次）を取得
      logger.info("書籍の詳細情報をクロールしています");
      // 引数をオブジェクト形式で渡すように修正
      const crawlResult = await crawlBookDescriptionUseCase.execute({ bookList: enrichedBookList, type: mode });
      if (crawlResult.isError()) {
        // エラーハンドリングを追加 (ログ出力はユースケース内で行われる想定)
        throw crawlResult.unwrapError();
      }

      // 5. データの保存とエクスポート
      logger.info("データを保存しています");
      // 引数をオブジェクト形式で渡すように修正
      const saveResult = await saveBookListUseCase.execute({
        bookList: enrichedBookList,
        type: mode,
        exportToCsv: true, // デフォルトでCSVエクスポートを有効にする (必要に応じてオプション化)
        uploadToCloud: false // デフォルトでクラウドアップロードを無効にする (必要に応じてオプション化)
        // outputFilePath は SaveBookListParams には含まれていないため削除 (必要ならユースケース側で対応)
      });
      if (saveResult.isError()) {
        // エラーハンドリングを追加 (ログ出力はユースケース内で行われる想定)
        throw saveResult.unwrapError();
      }

      logger.info("処理が正常に完了しました");
    } else {
      logger.info("書籍リストに変更はありません。処理を終了します");
    }
  } catch (error) {
    logger.error(`処理中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
