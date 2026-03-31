/**
 * bookmeter CLI エントリポイント。
 * DI の組み立てをここで行い、各モジュールに注入する。
 */

import path from "path";

import { isAxiosError } from "axios";
import { config } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../../.libs/constants";
import { exportFile } from "../../.libs/utils";

import { JOB_NAME, BOOKMETER_DEFAULT_USER_ID, CSV_EXPORT_COLUMNS } from "./constants";
import { createDrizzleBookRepository } from "./db/bookRepository";
import { createDbClient } from "./db/client";
import { createFirebaseUploader } from "./db/remoteUploader";
import { isBookListDifferent } from "./domain/book";
import { fetchBiblioInfo } from "./fetchers";
import { createAxiosHttpClient } from "./fetchers/httpClient";
import { Bookmaker } from "./scrapers/bookmaker";
import { crawlKinokuniya } from "./scrapers/kinokuniya";
import { buildCsvFileName, getPrevBookList } from "./utils";

import type { BookList } from "./domain/book";
import type { OutputFilePath } from "./utils";

config({ path: path.join(__dirname, "../.env") });
const cinii_appid = process.env.CINII_API_APPID!.toString();
const google_books_api_key = process.env.GOOGLE_BOOKS_API_KEY!.toString();
const isbnDb_api_key = process.env.ISBNDB_API_KEY!.toString();

const stealthPlugin = StealthPlugin();
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

type MainFuncOption = {
  mode: "wish" | "stacked";
  userId?: string;
  doLogin?: boolean;
  outputFilePath?: OutputFilePath | null;
  noRemoteCheck?: boolean;
  skipBookListComparison?: boolean;
  skipFetchingBiblioInfo?: boolean;
};

// --- DI: インフラ実装の組み立て ---
const DB_FILE = "./books.sqlite";
const DB_STORAGE_PATH = "bookmeter/books.sqlite";

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
    if (noRemoteCheck) {
      console.log(`${JOB_NAME}: To check the remote is disabled`);
    }

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      args: CHROME_ARGS,
      slowMo: 15
    });

    const prevBookList = await getPrevBookList(csvFileName[mode], repo);
    if (prevBookList === null) {
      console.log(`${JOB_NAME}: The previous result is not found. Path: ${csvFileName[mode]}`);
      if (noRemoteCheck) throw new Error("前回データが存在しないのにリモートチェックをオフにすることは出来ません");
    }

    const book = new Bookmaker(browser, userId);
    const latestBookList = noRemoteCheck
      ? (prevBookList as BookList)
      : doLogin
        ? await book.login().then((book) => book.explore(mode, doLogin))
        : await book.explore(mode, doLogin);
    await browser.close();

    const hasDifferences = isBookListDifferent(prevBookList, latestBookList, skipBookListComparison);
    book.setHasChanges(hasDifferences);

    if (hasDifferences) {
      let updatedBooklist = latestBookList;

      if (!skipFetchingBiblioInfo) {
        try {
          console.log(`${JOB_NAME}: Fetching bibliographic information`);
          updatedBooklist = await fetchBiblioInfo(
            latestBookList,
            {
              cinii: cinii_appid,
              google: google_books_api_key,
              isbnDb: isbnDb_api_key
            },
            http
          );
        } catch (error) {
          console.error(`${JOB_NAME}: Error fetching bibliographic information:`, error);
        }
      } else {
        console.log(`${JOB_NAME}: Skipping bibliographic information fetch.`);
      }

      if (book.hasChanges) {
        try {
          console.log(`${JOB_NAME}: Crawling Kinokuniya for book descriptions`);
          await crawlKinokuniya(updatedBooklist, mode, repo);

          console.log(`${JOB_NAME}: Saving data to SQLite database`);
          repo.save(updatedBooklist, mode);

          console.log(`${JOB_NAME}: Generating CSV from SQLite database`);
          await repo.exportToCsv(mode, csvFileName[mode], CSV_EXPORT_COLUMNS[mode]);
          console.log(`${JOB_NAME}: Finished writing ${csvFileName[mode]}`);

          await uploader.upload(DB_FILE);
        } catch (error) {
          console.error(`${JOB_NAME}: Error during data processing or export:`, error);

          try {
            console.log(
              `${JOB_NAME}: Error occurred, falling back to direct CSV export (using all columns except description)`
            );
            const fallbackPayload = Array.from(updatedBooklist.values()).map((book) => {
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
      }
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
