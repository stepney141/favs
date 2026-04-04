/**
 * bookmeter CLI エントリポイント。
 * DI とパイプラインのオーケストレーションのみを担当する。
 */

import path from "path";

import { isAxiosError } from "axios";
import { config } from "dotenv";

import { describeExecutionPlan, needsBrowser, parseCliArgs, resolveExecutionPlan } from "./application/executionMode";
import {
  collectLatestBookList,
  crawlDescriptionPhase,
  exportCsvPhase,
  fetchBiblioPhase,
  loadCachedBookIndex,
  loadPreviousSnapshot,
  persistPhase,
  shouldRunDownstreamPhases,
  uploadPhase
} from "./application/pipeline";
import { createDrizzleBookRepository } from "./db/bookRepository";
import { createDbClient } from "./db/client";
import { createFirebaseUploader } from "./db/remoteUploader";
import { formatErrorForLog } from "./fetchers/errors";
import { createAxiosHttpClient } from "./fetchers/httpClient";
import { Bookmaker } from "./scrapers/bookmaker";
import { launchBookmeterBrowser } from "./scrapers/browser";

import type { MainFuncOption } from "./application/executionMode";

config({ path: path.join(__dirname, "../.env") });

const DB_FILE = "./books.sqlite";
const DB_STORAGE_PATH = "bookmeter/books.sqlite";

export async function main(option: MainFuncOption): Promise<boolean> {
  const executionPlanResult = resolveExecutionPlan(option);
  if (!executionPlanResult.ok) {
    console.error(executionPlanResult.err);
    return false;
  }

  const executionPlan = executionPlanResult.value;
  const dbClient = createDbClient(DB_FILE);
  const repo = createDrizzleBookRepository(dbClient);
  const uploader = createFirebaseUploader(
    {
      apiKey: process.env.FIREBASE_API_KEY!,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
      projectId: process.env.FIREBASE_PROJECT_ID!,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
      appId: process.env.FIREBASE_APP_ID!
    },
    DB_STORAGE_PATH
  );
  const http = createAxiosHttpClient();
  const fetcherCredentials = {
    cinii: process.env.CINII_API_APPID!.toString(),
    google: process.env.GOOGLE_BOOKS_API_KEY!.toString(),
    isbnDb: process.env.ISBNDB_API_KEY!.toString()
  };
  const browser = needsBrowser(executionPlan) ? await launchBookmeterBrowser() : null;

  try {
    const startTime = Date.now();
    console.log(`Execution plan => ${describeExecutionPlan(executionPlan)}`);

    const { csvPath, prevBookList } = await loadPreviousSnapshot(executionPlan, repo);
    const cachedBooksByUrl = loadCachedBookIndex(repo);
    const latestBookList = await collectLatestBookList(
      executionPlan,
      prevBookList,
      browser,
      (activeBrowser, userId) => {
        return new Bookmaker(activeBrowser, userId, cachedBooksByUrl);
      }
    );

    if (!shouldRunDownstreamPhases(executionPlan, prevBookList, latestBookList)) {
      console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
      return true;
    }

    const enrichedBookList = await fetchBiblioPhase(
      executionPlan,
      latestBookList,
      fetcherCredentials,
      http,
      new Set(cachedBooksByUrl.keys())
    );
    await crawlDescriptionPhase(executionPlan, enrichedBookList, prevBookList, repo, browser);

    const hasPersisted = persistPhase(executionPlan, enrichedBookList, repo);
    await exportCsvPhase(executionPlan, csvPath, enrichedBookList, repo, hasPersisted);
    await uploadPhase(executionPlan, uploader, DB_FILE, hasPersisted);

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
    return true;
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(`Error: ${error.response?.status ?? "unknown"} ${error.message}`);
    } else {
      console.error(formatErrorForLog(error));
    }
    return false;
  } finally {
    await browser?.close();
  }
}

/**
 * examples:
 * tsx bookmeter/src/index.ts full wish
 * tsx bookmeter/src/index.ts scrape-only stacked --no-login
 * tsx bookmeter/src/index.ts local-downstream wish
 * tsx bookmeter/src/index.ts local-biblio wish
 * tsx bookmeter/src/index.ts full wish --force
 * tsx bookmeter/src/index.ts full wish --user-id 42
 */
(async () => {
  const cliOption = parseCliArgs(process.argv);
  if (!cliOption.ok) {
    console.error(cliOption.err);
    process.exit(1);
  }

  if (cliOption.value.type === "help") {
    return;
  }

  const success = await main(cliOption.value.option);

  if (!success) {
    process.exit(1);
  }
})();
