import path from "path";

import { isAxiosError } from "axios";
import { config } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../../../.libs/constants";
import { exportFile } from "../../../.libs/utils"; // mapToArray is no longer needed here
import { createHttpBibliographyEnricher } from "../application/usecases/enrich-bibliography";
import { JOB_NAME, BOOKMETER_DEFAULT_USER_ID, CSV_EXPORT_COLUMNS } from "../domain/constants"; // Import CSV_EXPORT_COLUMNS
import { createAxiosHttpClient } from "../infrastructure/ports/axios-http-client";
import { buildCsvFileName, getPrevBookList } from "../infrastructure/utils";

import { compareBookLists } from "./domain/services/bookListComparison";
import { createKinokuniyaDescriptionEnricher } from "./infrastructure/description/kinokuniyaDescriptionEnricher";
import { createSqliteBookListSnapshotStore, createSqliteCsvExporter } from "./infrastructure/persistence/sqliteGateway";
import { createPuppeteerBookListScraper } from "./infrastructure/scraping/puppeteerBookListScraper";
import { createFirebaseStoragePublisher } from "./infrastructure/storage/firebaseStoragePublisher";

import type { MainFuncOption } from "./options";
import type { BookList } from "../domain/types";

config({ path: path.join(__dirname, "../../.env") });
const cinii_appid = process.env.CINII_API_APPID!.toString();
const google_books_api_key = process.env.GOOGLE_BOOKS_API_KEY!.toString();
const isbnDb_api_key = process.env.ISBNDB_API_KEY!.toString();
const bookmeterAccount = process.env.BOOKMETER_ACCOUNT ?? null;
const bookmeterPassword = process.env.BOOKMETER_PASSWORD ?? null;
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY ?? "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.FIREBASE_APP_ID ?? ""
};

const stealthPlugin = StealthPlugin();
/* ref:
- https://github.com/berstend/puppeteer-extra/issues/668
- https://github.com/berstend/puppeteer-extra/issues/822
*/
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("navigator.plugins");
stealthPlugin.enabledEvasions.delete("media.codecs");
puppeteer.use(stealthPlugin);

function parseArgv(argv: string[]): "wish" | "stacked" {
  const mode = argv[2];
  if (mode === "wish" || mode === "stacked") {
    return mode;
  } else {
    throw new Error("Specify the process mode");
  }
}

export async function main({
  mode,
  userId = BOOKMETER_DEFAULT_USER_ID,
  doLogin = true,
  outputFilePath = null,
  noRemoteCheck = false,
  skipBookListComparison = false,
  skipFetchingBiblioInfo = false
}: MainFuncOption): Promise<void> {
  try {
    const startTime = Date.now();
    const csvFileName = buildCsvFileName(userId, outputFilePath);
    const csvExporter = createSqliteCsvExporter((currentMode) => csvFileName[currentMode], CSV_EXPORT_COLUMNS);
    const snapshotStore = createSqliteBookListSnapshotStore();
    const httpClient = createAxiosHttpClient();
    const bibliographyEnricher = createHttpBibliographyEnricher(
      {
        ciniiAppId: cinii_appid,
        googleBooksApiKey: google_books_api_key,
        isbnDbApiKey: isbnDb_api_key
      },
      { httpClient }
    );
    const descriptionEnricher = createKinokuniyaDescriptionEnricher();
    const backupPublisher = createFirebaseStoragePublisher(firebaseConfig);

    if (noRemoteCheck) {
      console.log(`${JOB_NAME}: Remote scraping is disabled; using the previous dataset.`);
    }

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      args: CHROME_ARGS,
      slowMo: 15
    });

    try {
      const scraper = createPuppeteerBookListScraper({
        browser,
        userId,
        credentials:
          bookmeterAccount && bookmeterPassword
            ? { username: bookmeterAccount, password: bookmeterPassword }
            : undefined
      });

      const prevBookList = await getPrevBookList(csvFileName[mode]);
      if (prevBookList === null) {
        console.log(`${JOB_NAME}: The previous result is not found. Path: ${csvFileName[mode]}`);
        if (noRemoteCheck) throw new Error("前回データが存在しないのにリモートチェックをオフにすることは出来ません");
      }

      const latestBookList = noRemoteCheck
        ? (prevBookList as BookList)
        : await scraper.scrape(mode, { requireLogin: doLogin });

      const comparison = compareBookLists(prevBookList, latestBookList, { skipComparison: skipBookListComparison });
      if (!comparison.hasChanges) {
        console.log(
          `${JOB_NAME}: Cannot find any differences between the local and remote. The process will be aborted...`
        );
        console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
        return;
      }

      switch (comparison.reason) {
        case "SKIPPED":
          console.log(`${JOB_NAME}: Skipping book list comparison by request; continuing with synchronization.`);
          break;
        case "NO_PREVIOUS":
          console.log(`${JOB_NAME}: The previous result is not found. Path: ${csvFileName[mode]}`);
          break;
        case "DIFFERENT":
          console.log(`${JOB_NAME}: Detected some diffs between the local and remote.`);
          break;
      }

      let enrichedBookList = latestBookList;
      if (!skipFetchingBiblioInfo) {
        try {
          console.log(`${JOB_NAME}: Fetching bibliographic information`);
          enrichedBookList = await bibliographyEnricher.enrich(latestBookList);
        } catch (error) {
          console.error(`${JOB_NAME}: Error fetching bibliographic information:`, error);
        }
      } else {
        console.log(`${JOB_NAME}: Skipping bibliographic information fetch.`);
      }

      let describedBookList = enrichedBookList;
      try {
        console.log(`${JOB_NAME}: Crawling Kinokuniya for book descriptions`);
        describedBookList = await descriptionEnricher.enrich(mode, enrichedBookList);

        console.log(`${JOB_NAME}: Saving data to SQLite database`);
        await snapshotStore.save(mode, describedBookList);

        console.log(`${JOB_NAME}: Generating CSV from SQLite database`);
        await csvExporter.export(mode, describedBookList);
        console.log(`${JOB_NAME}: Finished writing ${csvFileName[mode]}`);

        console.log(`${JOB_NAME}: Uploading SQLite database to Firebase Storage`);
        await backupPublisher.publish();
      } catch (error) {
        console.error(`${JOB_NAME}: Error during data processing or export:`, error);

        try {
          console.log(
            `${JOB_NAME}: Error occurred, falling back to direct CSV export (using all columns except description)`
          );
          const fallbackPayload = Array.from(describedBookList.values()).map((book) => {
            const { description, ...rest } = book;
            return rest;
          });
          await exportFile({
            fileName: csvFileName[mode],
            payload: fallbackPayload,
            targetType: "csv",
            mode: "overwrite"
          });
          console.log(`${JOB_NAME}: Finished fallback writing to ${csvFileName[mode]}`);
        } catch (csvError) {
          console.error(`${JOB_NAME}: Error in fallback CSV export:`, csvError);
        }
      }
    } finally {
      await browser.close();
    }

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    if (isAxiosError(e)) {
      const { status, message } = e;
      console.error(`Error: ${status} ${message}`);
    } else {
      console.log(e);
    }
    process.exit(1);
  }
}

// usecases: https://gist.github.com/stepney141/8d3f194c15122f0134cb87b2b10708f8
(async () => {
  const mode = parseArgv(process.argv);

  // For degugging:
  // await main({ mode, noRemoteCheck: true, skipBookListComparison: true, skipFetchingBiblioInfo: true });
  await main({ mode });
})();
