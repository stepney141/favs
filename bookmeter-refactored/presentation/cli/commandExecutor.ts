import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { TYPES } from "../di/types";

import { BOOKMETER_USER_ID } from "./constants";

import type { DIContainer } from "../di/container";
import type {
  CrawlBookDescriptionUseCase,
  FetchBiblioInfoUseCase,
  GetBookListUseCase,
  SaveBookListUseCase,
  GetBookListParams
} from "../di/types";
import type { Logger } from "@/application/ports/output/logger";

type Mode = "wish" | "stacked";

/**
 * yargsによってパースされたコマンドラインオプションの型。
 * presentation/index.ts からも参照されるため、ここに定義を移設。
 */
export interface CliOptions {
  readonly userId: string;
  readonly outputFilePath?: string;
  readonly source: "remote" | "local";
  readonly processing: "smart" | "force" | "skip";
  readonly "biblio-fetching": "enabled" | "disabled";
}

/**
 * コマンドライン引数を解析する
 * この関数は presentation/index.ts に配置されるべきだが、
 * CliOptions の定義を共有するため、一時的にここに配置。
 * TODO: CliOptions の定義を共有するより良い方法を検討し、この関数を index.ts に戻す。
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
        "取得した書籍リストの後続処理方法:",
        "  smart: 前回のリストと比較し変更がある場合のみ後続処理を実行 (デフォルト)",
        "  force: 変更の有無に関わらず強制的に後続処理を実行",
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

  const mode = parsedArgs.mode as Mode; // demandOption: true なので undefined にはならない

  // CliOptionsに定義されたプロパティのみを抽出し、型を明示する
  const options: CliOptions = {
    userId: parsedArgs.userId,
    outputFilePath: parsedArgs.outputFilePath,
    source: parsedArgs.source as CliOptions["source"],
    processing: parsedArgs.processing as CliOptions["processing"],
    "biblio-fetching": parsedArgs["biblio-fetching"] as CliOptions["biblio-fetching"]
  };

  return { mode, options };
}

/**
 * コマンドライン引数に基づいてコマンドを実行する
 * @param container 依存性注入コンテナ
 * @param mode 実行モード（"wish" または "stacked"）
 * @param cliOptions yargsからパースされたコマンドオプション
 */
export async function executeCommand(
  container: DIContainer,
  mode: Mode,
  cliOptions: Readonly<CliOptions>
): Promise<void> {
  // userIdのチェック
  if (typeof cliOptions.userId !== "string" || cliOptions.userId.trim() === "") {
    throw new Error("User ID is required and must be a non-empty string.");
  }

  // 依存関係の解決
  const logger = container.get<Logger>(TYPES.Logger);
  const getBookListUseCase = container.get<GetBookListUseCase>(TYPES.GetBookListUseCase);
  const fetchBiblioInfoUseCase = container.get<FetchBiblioInfoUseCase>(TYPES.FetchBiblioInfoUseCase);
  const saveBookListUseCase = container.get<SaveBookListUseCase>(TYPES.SaveBookListUseCase);
  const crawlBookDescriptionUseCase = container.get<CrawlBookDescriptionUseCase>(TYPES.CrawlBookDescriptionUseCase);

  logger.info(`処理モード: ${mode}`);
  logger.info(`ユーザーID: ${cliOptions.userId}`);
  logger.info(`データソース: ${cliOptions.source}`);
  logger.info(`処理戦略: ${cliOptions.processing}`);
  logger.info(`書誌情報取得: ${cliOptions["biblio-fetching"]}`);
  if (cliOptions.outputFilePath) {
    logger.info(`出力ファイルパス: ${cliOptions.outputFilePath}`);
  }

  // 処理の開始をログに記録
  logger.info(`${mode === "wish" ? "読みたい本" : "積読本"}リストの処理を開始します`);

  try {
    // 1. 書籍リストの取得
    logger.info("書籍リストを取得しています...");
    const getBookListParams: GetBookListParams = {
      // インポートした型を使用
      type: mode,
      userId: cliOptions.userId,
      source: cliOptions.source,
      processing: cliOptions.processing,
      outputFilePath: cliOptions.outputFilePath
      // signal はここでは未指定。必要なら AbortController を使う
    };
    logger.debug("GetBookListUseCase Params:", { ...getBookListParams }); // スプレッド構文で展開
    const bookListResult = await getBookListUseCase.execute(getBookListParams);

    if (bookListResult.isError()) {
      throw bookListResult.unwrapError();
    }

    const { books, hasChanges } = bookListResult.unwrap();
    logger.info(`書籍リスト取得完了。${books.size}件の書籍が見つかりました。`);
    logger.info(hasChanges ? "前回実行時から変更があります。" : "前回実行時から変更はありません。");

    // 'skip' モードの場合はここで処理を終了
    if (cliOptions.processing === "skip") {
      logger.info("処理戦略 'skip' のため、これ以上の処理を行わずに終了します。");
      return;
    }

    // 'smart' モードで変更がない場合も処理を終了
    if (cliOptions.processing === "smart" && !hasChanges) {
      logger.info("処理戦略 'smart' で書籍リストに変更がないため、処理を終了します。");
      return;
    }

    // 'force' モード、または 'smart' モードで変更があった場合に後続処理を実行
    logger.info(
      cliOptions.processing === "force"
        ? "処理戦略 'force' のため、強制的に後続処理を実行します。"
        : "処理戦略 'smart' で変更があったため、後続処理を実行します。"
    );

    // 2. 書誌情報の取得（オプションによりスキップ可能）
    let enrichedBookList = books;
    if (cliOptions["biblio-fetching"] === "enabled") {
      logger.info("書誌情報を取得しています...");
      const fetchResult = await fetchBiblioInfoUseCase.execute(books);
      // fetchBiblioInfoUseCase が Result 型を返すようになったと仮定 (エラー処理のため)
      // if (fetchResult.isError()) throw fetchResult.unwrapError();
      // enrichedBookList = fetchResult.unwrap();
      // 現状はそのまま代入
      enrichedBookList = fetchResult; // ユースケースが直接リストを返すと仮定
      logger.info("書誌情報の取得が完了しました。");
    } else {
      logger.info("書誌情報の取得をスキップします (--biblio-fetching disabled)。");
    }

    // 3. 書籍の詳細情報（あらすじ・目次）を取得
    logger.info("書籍の詳細情報（あらすじ・目次）をクロールしています...");
    const crawlResult = await crawlBookDescriptionUseCase.execute({ bookList: enrichedBookList, type: mode });
    if (crawlResult.isError()) {
      const error = crawlResult.unwrapError();
      logger.error("書籍詳細情報のクロール中にエラーが発生しました。", { error });
      throw error;
    }
    logger.info("書籍詳細情報のクロールが完了しました。");

    // 4. データの保存とエクスポート
    logger.info("データを保存しています...");
    const saveResult = await saveBookListUseCase.execute({
      bookList: enrichedBookList,
      type: mode,
      exportToCsv: true, // TODO: オプション化を検討
      uploadToCloud: false // TODO: オプション化を検討
      // outputFilePath は saveBookListUseCase の責務ではないため、ここでは渡さない
      // 必要であれば、FileStorageService 側でパスを解決する
    });
    if (saveResult.isError()) {
      const error = saveResult.unwrapError();
      logger.error("データ保存中にエラーが発生しました。", { error });
      throw error;
    }
    logger.info("データの保存が完了しました。");

    logger.info("全ての処理が正常に完了しました。");
  } catch (error) {
    logger.error(`処理中に予期せぬエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`, {
      error
    });
    if (error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }
    throw error; // エラーを再スローして呼び出し元で処理できるようにする
  }
}
