/**
 * bookmeter の各処理フェーズを独立関数として定義する。
 * index.ts はこれらを組み合わせるオーケストレーターに徹する。
 */

import { exportFile } from "../../../.libs/utils";
import { CSV_EXPORT_COLUMNS } from "../db/constants";
import { buildCsvFileName, getPrevBookList } from "../db/dataLoader";
import { isBookListDifferent } from "../domain/book";
import { fetchBiblioInfo } from "../fetchers";
import { formatErrorForLog } from "../fetchers/errors";
import {
  buildExistingDescriptionMap,
  canFetchKinokuniyaDescription,
  fetchKinokuniyaDescription
} from "../scrapers/kinokuniya";

import type { ExecutionPlan } from "./executionMode";
import type { BookRepository } from "../db/bookRepository";
import type { RemoteUploader } from "../db/remoteUploader";
import type { Book, BookList } from "../domain/book";
import type { HttpClient } from "../fetchers/httpClient";
import type { FetcherCredentials } from "../fetchers/types";
import type { Bookmaker } from "../scrapers/bookmaker";
import type { Browser } from "puppeteer";

export type PipelineDependencies = {
  repo: BookRepository;
  uploader: RemoteUploader;
  http: HttpClient;
  fetcherCredentials: FetcherCredentials;
  dbFilePath: string;
};

export type LoadedSnapshot = {
  csvPath: string;
  prevBookList: BookList | null;
};

// 既存の wish / stacked テーブルを結合し、bookmeter_url 単位のキャッシュ索引を作る。
export function loadCachedBookIndex(repo: Pick<BookRepository, "load">): BookList {
  const cachedBooksByUrl: BookList = new Map();

  for (const tableName of ["wish", "stacked"] as const) {
    const loadResult = repo.load(tableName);
    if (!loadResult.ok) {
      console.error(`Failed to load ${tableName} cache from SQLite:`, loadResult.err);
      continue;
    }

    for (const [bookmeterUrl, book] of loadResult.value.entries()) {
      if (!cachedBooksByUrl.has(bookmeterUrl)) {
        cachedBooksByUrl.set(bookmeterUrl, book);
      }
    }
  }

  console.log(`Loaded ${cachedBooksByUrl.size} cached books from SQLite.`);
  return cachedBooksByUrl;
}

// 前回実行時のCSVパスと保存済み書誌一覧を読み込む。
export async function loadPreviousSnapshot(plan: ExecutionPlan, repo: BookRepository): Promise<LoadedSnapshot> {
  const csvPath = buildCsvFileName(plan.userId, plan.outputFilePath)[plan.target];
  const prevBookList = await getPrevBookList(csvPath, repo);

  if (prevBookList === null && plan.scrape.type === "local-cache") {
    throw new Error("前回データが存在しないのにローカルキャッシュ実行を行うことは出来ません");
  }

  if (prevBookList === null) {
    console.log(`The previous result is not found. Path: ${csvPath}`);
  }

  return {
    csvPath,
    prevBookList
  };
}

// 実行計画に応じて最新の蔵書一覧を取得する。
export async function collectLatestBookList(
  plan: ExecutionPlan,
  prevBookList: BookList | null,
  browser: Browser | null,
  createBookmaker: (browser: Browser, userId: string) => Bookmaker
): Promise<BookList> {
  if (plan.scrape.type === "local-cache") {
    console.log("Using the previous snapshot as the latest book list");
    return new Map(prevBookList ?? new Map());
  }

  if (browser === null) {
    throw new Error("Browser is required for remote scraping");
  }

  const bookmaker = createBookmaker(browser, plan.userId);
  if (plan.scrape.doLogin) {
    await bookmaker.login();
  }

  return bookmaker.explore(plan.target, plan.scrape.doLogin);
}

// 後続フェーズを実行するかどうかを判定する。
export function shouldRunDownstreamPhases(
  plan: ExecutionPlan,
  prevBookList: BookList | null,
  latestBookList: BookList
): boolean {
  if (
    plan.phases.fetchBiblio !== true &&
    plan.phases.crawlDescriptions !== true &&
    plan.phases.persist !== true &&
    plan.phases.exportCsv !== true &&
    plan.phases.uploadDb !== true
  ) {
    console.log("No downstream phases are enabled. The pipeline will stop after scraping.");
    return false;
  }

  if (plan.phases.compare !== true) {
    console.log("Skipping book list comparison.");
    return true;
  }

  if (plan.forceRefresh) {
    console.log("Force refresh is enabled. Downstream phases will run regardless of comparison results.");
    return true;
  }

  return isBookListDifferent(prevBookList, latestBookList, false);
}

// 必要に応じて書誌情報を補完する。
export async function fetchBiblioPhase(
  plan: ExecutionPlan,
  latestBookList: BookList,
  fetcherCredentials: FetcherCredentials,
  http: HttpClient,
  cachedBookUrls: ReadonlySet<string>
): Promise<BookList> {
  if (plan.phases.fetchBiblio !== true) {
    console.log("Skipping bibliographic information fetch.");
    return latestBookList;
  }

  try {
    console.log("Fetching bibliographic information");
    return await fetchBiblioInfo(latestBookList, fetcherCredentials, http, {
      cachedBookUrls,
      forceRefresh: plan.forceRefresh
    });
  } catch (error) {
    console.error(`Error fetching bibliographic information: ${formatErrorForLog(error)}`);
    return latestBookList;
  }
}

// 紀伊國屋書店の説明文を取得して一覧とDBを更新する。
export async function crawlDescriptionPhase(
  plan: ExecutionPlan,
  latestBookList: BookList,
  prevBookList: BookList | null,
  repo: Pick<BookRepository, "load" | "updateDescription">,
  browser: Browser | null
): Promise<void> {
  if (plan.phases.crawlDescriptions !== true) {
    console.log("Skipping Kinokuniya crawl.");
    return;
  }

  if (browser === null) {
    throw new Error("Browser is required for Kinokuniya crawling");
  }

  console.log("Crawling Kinokuniya for book descriptions");

  const existingDescriptions = buildExistingDescriptionMap(plan.target, repo.load(plan.target));
  console.log(`Loaded ${existingDescriptions.size} existing descriptions from database.`);
  const newBookUrls: Set<string> | null =
    prevBookList === null ? null : new Set([...latestBookList.keys()].filter((url) => !prevBookList.has(url)));

  const page = await browser.newPage();

  try {
    for (const book of latestBookList.values()) {
      const identifier = book.isbn_or_asin;

      if (identifier === "") {
        console.log(`Skipping book with missing ISBN/ASIN: ${book.book_title}`);
        continue;
      }

      if (!canFetchKinokuniyaDescription(identifier)) {
        continue;
      }

      const cachedDescription = existingDescriptions.get(identifier);
      if (cachedDescription !== undefined) {
        latestBookList.set(book.bookmeter_url, { ...book, description: cachedDescription });
        if (!plan.forceRefresh) {
          continue;
        }
      }

      const isNewBook = newBookUrls === null || newBookUrls.has(book.bookmeter_url);
      if (!plan.forceRefresh && !isNewBook) {
        continue;
      }

      const description = await fetchKinokuniyaDescription(page, identifier);
      latestBookList.set(book.bookmeter_url, { ...book, description });

      if (plan.phases.persist) {
        repo.updateDescription(plan.target, identifier, description);
      }
    }
  } finally {
    await page.close();
  }
}

// 最新の蔵書一覧をSQLiteに保存する。
export function persistPhase(
  plan: ExecutionPlan,
  latestBookList: BookList,
  repo: Pick<BookRepository, "save">
): boolean {
  if (plan.phases.persist !== true) {
    console.log("Skipping SQLite persistence.");
    return false;
  }

  console.log("Saving data to SQLite database");
  const saveResult = repo.save(latestBookList, plan.target);

  if (!saveResult.ok) {
    console.error("Error saving to database:", saveResult.err);
    return false;
  }

  return true;
}

// 保存結果に応じてCSVを出力する。
export async function exportCsvPhase(
  plan: ExecutionPlan,
  csvPath: string,
  latestBookList: BookList,
  repo: Pick<BookRepository, "exportToCsv">,
  hasPersisted: boolean
): Promise<void> {
  if (plan.phases.exportCsv !== true) {
    console.log("Skipping CSV export.");
    return;
  }

  if (hasPersisted) {
    console.log("Generating CSV from SQLite database");
    const exportResult = await repo.exportToCsv(plan.target, csvPath, CSV_EXPORT_COLUMNS[plan.target]);

    if (exportResult.ok) {
      console.log(`Finished writing ${csvPath}`);
      return;
    }

    console.error("Error exporting CSV:", exportResult.err);
    console.log("Falling back to direct CSV export (using all columns except description)");
  } else {
    console.log("Exporting CSV directly from the in-memory book list");
  }

  try {
    // CSV直接出力用に説明文を除いたデータへ整形する
    const buildCsvFallbackPayload = (bookList: BookList): Omit<Book, "description">[] => {
      return Array.from(bookList.values()).map((book) => {
        return {
          bookmeter_url: book.bookmeter_url,
          isbn_or_asin: book.isbn_or_asin,
          book_title: book.book_title,
          author: book.author,
          publisher: book.publisher,
          published_date: book.published_date,
          sophia_opac: book.sophia_opac,
          utokyo_opac: book.utokyo_opac,
          exist_in_sophia: book.exist_in_sophia,
          exist_in_utokyo: book.exist_in_utokyo,
          sophia_mathlib_opac: book.sophia_mathlib_opac
        };
      });
    };

    await exportFile({
      fileName: csvPath,
      payload: buildCsvFallbackPayload(latestBookList),
      targetType: "csv",
      mode: "overwrite"
    });
    console.log(`Finished fallback writing to ${csvPath}`);
  } catch (csvError) {
    console.error("Error in fallback CSV export:", csvError);
  }
}

// 保存済みのSQLiteファイルをリモートへアップロードする。
export async function uploadPhase(
  plan: ExecutionPlan,
  uploader: RemoteUploader,
  dbFilePath: string,
  hasPersisted: boolean
): Promise<void> {
  if (plan.phases.uploadDb !== true) {
    console.log("Skipping database upload.");
    return;
  }

  if (!hasPersisted) {
    console.log("Skipping database upload because persistence did not run successfully.");
    return;
  }

  const uploadResult = await uploader.upload(dbFilePath);
  if (!uploadResult.ok) {
    console.error("Error uploading database:", uploadResult.err);
  }
}
