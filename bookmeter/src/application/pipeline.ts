/**
 * bookmeter の各処理フェーズを独立関数として定義する。
 * index.ts はこれらを組み合わせるオーケストレーターに徹する。
 */

import { exportFile } from "../../../.libs/utils";
import { JOB_NAME } from "../constants";
import { CSV_EXPORT_COLUMNS } from "../db/constants";
import { buildCsvFileName, getPrevBookList } from "../db/dataLoader";
import { isBookListDifferent } from "../domain/book";
import { fetchBiblioInfo } from "../fetchers";
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

export async function loadPreviousSnapshot(plan: ExecutionPlan, repo: BookRepository): Promise<LoadedSnapshot> {
  const csvPath = buildCsvFileName(plan.userId, plan.outputFilePath)[plan.target];
  const prevBookList = await getPrevBookList(csvPath, repo);

  if (prevBookList === null && plan.scrape.type === "local-cache") {
    throw new Error("前回データが存在しないのにローカルキャッシュ実行を行うことは出来ません");
  }

  if (prevBookList === null) {
    console.log(`${JOB_NAME}: The previous result is not found. Path: ${csvPath}`);
  }

  return {
    csvPath,
    prevBookList
  };
}

export async function collectLatestBookList(
  plan: ExecutionPlan,
  prevBookList: BookList | null,
  browser: Browser | null,
  createBookmaker: (browser: Browser, userId: string) => Bookmaker
): Promise<BookList> {
  if (plan.scrape.type === "local-cache") {
    console.log(`${JOB_NAME}: Using the previous snapshot as the latest book list`);
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
    console.log(`${JOB_NAME}: No downstream phases are enabled. The pipeline will stop after scraping.`);
    return false;
  }

  if (plan.phases.compare !== true) {
    console.log(`${JOB_NAME}: Skipping book list comparison.`);
    return true;
  }

  return isBookListDifferent(prevBookList, latestBookList, false, JOB_NAME);
}

export async function fetchBiblioPhase(
  plan: ExecutionPlan,
  latestBookList: BookList,
  fetcherCredentials: FetcherCredentials,
  http: HttpClient
): Promise<BookList> {
  if (plan.phases.fetchBiblio !== true) {
    console.log(`${JOB_NAME}: Skipping bibliographic information fetch.`);
    return latestBookList;
  }

  try {
    console.log(`${JOB_NAME}: Fetching bibliographic information`);
    return await fetchBiblioInfo(latestBookList, fetcherCredentials, http);
  } catch (error) {
    console.error(`${JOB_NAME}: Error fetching bibliographic information:`, error);
    return latestBookList;
  }
}

export async function crawlDescriptionPhase(
  plan: ExecutionPlan,
  latestBookList: BookList,
  repo: Pick<BookRepository, "load" | "updateDescription">,
  browser: Browser | null
): Promise<void> {
  if (plan.phases.crawlDescriptions !== true) {
    console.log(`${JOB_NAME}: Skipping Kinokuniya crawl.`);
    return;
  }

  if (browser === null) {
    throw new Error("Browser is required for Kinokuniya crawling");
  }

  console.log(`${JOB_NAME}: Crawling Kinokuniya for book descriptions`);

  const existingDescriptions = buildExistingDescriptionMap(plan.target, repo.load(plan.target));
  console.log(`${JOB_NAME}: Loaded ${existingDescriptions.size} existing descriptions from database.`);

  const page = await browser.newPage();

  try {
    for (const book of latestBookList.values()) {
      const identifier = book.isbn_or_asin;

      if (identifier === "") {
        console.log(`${JOB_NAME}: Skipping book with missing ISBN/ASIN: ${book.book_title}`);
        continue;
      }

      if (!canFetchKinokuniyaDescription(identifier)) {
        continue;
      }

      const cachedDescription = existingDescriptions.get(identifier);
      if (cachedDescription !== undefined) {
        latestBookList.set(book.bookmeter_url, { ...book, description: cachedDescription });
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

export function persistPhase(
  plan: ExecutionPlan,
  latestBookList: BookList,
  repo: Pick<BookRepository, "save">
): boolean {
  if (plan.phases.persist !== true) {
    console.log(`${JOB_NAME}: Skipping SQLite persistence.`);
    return false;
  }

  console.log(`${JOB_NAME}: Saving data to SQLite database`);
  const saveResult = repo.save(latestBookList, plan.target);

  if (!saveResult.ok) {
    console.error(`${JOB_NAME}: Error saving to database:`, saveResult.err);
    return false;
  }

  return true;
}

function buildCsvFallbackPayload(bookList: BookList): Omit<Book, "description">[] {
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
}

export async function exportCsvPhase(
  plan: ExecutionPlan,
  csvPath: string,
  latestBookList: BookList,
  repo: Pick<BookRepository, "exportToCsv">,
  hasPersisted: boolean
): Promise<void> {
  if (plan.phases.exportCsv !== true) {
    console.log(`${JOB_NAME}: Skipping CSV export.`);
    return;
  }

  if (hasPersisted) {
    console.log(`${JOB_NAME}: Generating CSV from SQLite database`);
    const exportResult = await repo.exportToCsv(plan.target, csvPath, CSV_EXPORT_COLUMNS[plan.target]);

    if (exportResult.ok) {
      console.log(`${JOB_NAME}: Finished writing ${csvPath}`);
      return;
    }

    console.error(`${JOB_NAME}: Error exporting CSV:`, exportResult.err);
    console.log(`${JOB_NAME}: Falling back to direct CSV export (using all columns except description)`);
  } else {
    console.log(`${JOB_NAME}: Exporting CSV directly from the in-memory book list`);
  }

  try {
    await exportFile({
      fileName: csvPath,
      payload: buildCsvFallbackPayload(latestBookList),
      targetType: "csv",
      mode: "overwrite"
    });
    console.log(`${JOB_NAME}: Finished fallback writing to ${csvPath}`);
  } catch (csvError) {
    console.error(`${JOB_NAME}: Error in fallback CSV export:`, csvError);
  }
}

export async function uploadPhase(
  plan: ExecutionPlan,
  uploader: RemoteUploader,
  dbFilePath: string,
  hasPersisted: boolean
): Promise<void> {
  if (plan.phases.uploadDb !== true) {
    console.log(`${JOB_NAME}: Skipping database upload.`);
    return;
  }

  if (!hasPersisted) {
    console.log(`${JOB_NAME}: Skipping database upload because persistence did not run successfully.`);
    return;
  }

  const uploadResult = await uploader.upload(dbFilePath);
  if (!uploadResult.ok) {
    console.error(`${JOB_NAME}: Error uploading database:`, uploadResult.err);
  }
}
