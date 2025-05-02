import path from "path";

import { config } from "dotenv";

import { GetBookListUseCase } from "../application/usecases/getBookListUseCase";
import { failure } from "../domain/models/valueObjects";
import { OpenBdApiClient } from "../infrastructure/adapters/apis/openBdApiClient";
import { SqliteBookRepository } from "../infrastructure/adapters/repositories/sqliteBookRepository";
import { BookmeterScraper } from "../infrastructure/adapters/scraping/bookmeterScraper";
import { PuppeteerBrowserSession } from "../infrastructure/adapters/scraping/puppeteerBrowserSession";

import type { BiblioInfoProvider, BiblioInfoProviderAggregator } from "../application/ports/output/biblioInfoProvider";
import type { Book } from "../domain/models/book";
import type { BookListType, UserId, BiblioinfoErrorStatus, Result } from "../domain/models/valueObjects";

// 環境変数の読み込み
config({ path: path.join(__dirname, "../../.env") });

// デフォルト値
const DEFAULT_DB_PATH = path.join(__dirname, "../books.sqlite");
const DEFAULT_USER_ID = "1003258" as UserId;

// ログインに必要な場合
const BOOKMETER_USERNAME = process.env.BOOKMETER_ACCOUNT || "";
const BOOKMETER_PASSWORD = process.env.BOOKMETER_PASSWORD || "";

// API資格情報
const BIBLIOINFO_CREDENTIALS = {
  cinii: process.env.CINII_API_APPID || "",
  google: process.env.GOOGLE_BOOKS_API_KEY || "",
  isbnDb: process.env.ISBNDB_API_KEY || ""
};

/**
 * BiblioInfoProviderの集約実装
 */
/**
 * BiblioInfoProviderの集約実装
 */
class BiblioInfoProviderAggregatorImpl implements BiblioInfoProviderAggregator {
  private readonly providers: BiblioInfoProvider[];

  constructor() {
    // 現時点ではOpenBDのみ実装
    this.providers = [new OpenBdApiClient()];
  }

  getProviders(): BiblioInfoProvider[] {
    return this.providers;
  }

  async fetchInfoByIsbn(isbn: string): Promise<Result<Partial<Book>, BiblioinfoErrorStatus>> {
    // プロバイダーを順に試行
    for (const provider of this.providers) {
      const result = await provider.fetchInfoByIsbn(isbn);
      if (result.type === "success") {
        return result;
      }
    }

    // すべて失敗した場合
    return failure("Not_found_in_OpenBD" as BiblioinfoErrorStatus);
  }

  async enrichBook(book: Book): Promise<Result<Book, BiblioinfoErrorStatus>> {
    // 順番にエンリッチメントを適用
    let enrichedBook = book;

    for (const provider of this.providers) {
      const result = await provider.enrichBook(enrichedBook);
      if (result.type === "success") {
        enrichedBook = result.value;
      }
    }

    return { type: "success" as const, value: enrichedBook };
  }
}

/**
 * コマンドライン引数を解析する
 * @param args コマンドライン引数
 * @returns 解析結果
 */
function parseArgs(args: string[]): {
  mode: BookListType;
  userId?: UserId;
  refresh?: boolean;
  noRemoteCheck?: boolean;
  skipBookListComparison?: boolean;
  skipFetchingBiblioInfo?: boolean;
  outputFilePath?: string;
} {
  const mode = args[2] as BookListType;

  if (mode !== "wish" && mode !== "stacked") {
    throw new Error("処理モードを指定してください（wish または stacked）");
  }

  return {
    mode,
    userId: DEFAULT_USER_ID,
    refresh: args.includes("--refresh"),
    noRemoteCheck: args.includes("--no-remote"),
    skipBookListComparison: args.includes("--skip-comparison"),
    skipFetchingBiblioInfo: args.includes("--skip-biblio"),
    outputFilePath: args.find((arg) => arg.startsWith("--output="))?.split("=")[1]
  };
}

/**
 * メイン関数
 * @param args コマンドライン引数
 */
export async function main(args: string[]): Promise<void> {
  try {
    console.log("Bookmeter Books Fetcher - リファクタリング版");

    // 引数の解析
    const params = parseArgs(args);
    console.log(`モード: ${params.mode}`);

    // リポジトリの作成
    const bookRepository = new SqliteBookRepository(DEFAULT_DB_PATH);

    // ブラウザセッションの作成
    const browserSession = new PuppeteerBrowserSession({
      headless: process.env.DEBUG ? false : "new"
    });

    // スクレイパーの作成
    const bookScraper = new BookmeterScraper(browserSession);

    // 書籍リスト取得ユースケースの作成
    const getBookListUseCase = new GetBookListUseCase(bookRepository, bookScraper);

    // 書籍リスト取得の実行
    const bookListResult = await getBookListUseCase.execute({
      type: params.mode,
      userId: params.userId || DEFAULT_USER_ID,
      refresh: params.refresh || false,
      doLogin: true,
      credentials: {
        username: BOOKMETER_USERNAME,
        password: BOOKMETER_PASSWORD
      }
    });

    if (bookListResult.type === "failure") {
      console.error(`エラー: ${bookListResult.error.message}`);
      process.exit(1);
    }

    const bookList = bookListResult.value;
    console.log(`${bookList.size()}冊の書籍情報を取得しました`);

    // 書誌情報の取得（必要な場合）
    if (!params.skipFetchingBiblioInfo) {
      const biblioInfoProviders = new BiblioInfoProviderAggregatorImpl();
      const fetchBiblioInfoUseCase = new FetchBiblioInfoUseCase(biblioInfoProviders);

      console.log("書誌情報を取得しています...");

      // ここでは単純化のため、一冊ずつ処理
      let enrichedBookList = bookList;

      for (const book of bookList.items.values()) {
        const result = await fetchBiblioInfoUseCase.execute({
          book,
          apiKeys: BIBLIOINFO_CREDENTIALS
        });

        if (result.type === "success") {
          enrichedBookList = enrichedBookList.add(result.value);
        }
      }

      console.log("書誌情報の取得が完了しました");

      // 更新された書籍リストを保存
      await bookRepository.save(enrichedBookList);

      // CSVにエクスポート
      const csvPath = params.outputFilePath || `./csv/bookmeter_${params.mode}_books.csv`;
      await bookRepository.export(enrichedBookList, csvPath);

      console.log(`CSVファイル ${csvPath} にエクスポートしました`);
    } else {
      console.log("書誌情報の取得をスキップしました");

      // CSVにエクスポート
      const csvPath = params.outputFilePath || `./csv/bookmeter_${params.mode}_books.csv`;
      await bookRepository.export(bookList, csvPath);

      console.log(`CSVファイル ${csvPath} にエクスポートしました`);
    }

    console.log("処理が完了しました");
  } catch (error) {
    console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// エントリーポイント
if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error("致命的なエラーが発生しました:", error);
    process.exit(1);
  });
}
