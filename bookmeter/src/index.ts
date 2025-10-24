import path from "path";

import { isAxiosError } from "axios";
import { config } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../../.libs/constants";
import { exportFile } from "../../.libs/utils"; // mapToArray is no longer needed here

import { Bookmaker } from "./bookmaker";
import { JOB_NAME, BOOKMETER_DEFAULT_USER_ID, CSV_EXPORT_COLUMNS } from "./constants"; // Import CSV_EXPORT_COLUMNS
import { fetchBiblioInfo } from "./fetchers";
import { uploadDatabaseToFirebase } from "./firebase";
import { crawlKinokuniya } from "./kinokuniya";
import { exportDatabaseTableToCsv, saveBookListToDatabase } from "./sqlite";
import { buildCsvFileName, getPrevBookList, isBookListDifferent } from "./utils";

import type { BookList, MainFuncOption } from "./types";

config({ path: path.join(__dirname, "../../.env") });
const cinii_appid = process.env.CINII_API_APPID!.toString();
const google_books_api_key = process.env.GOOGLE_BOOKS_API_KEY!.toString();
const isbnDb_api_key = process.env.ISBNDB_API_KEY!.toString();

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
    if (noRemoteCheck) {
      console.log(`${JOB_NAME}: To check the remote is disabled`);
    }

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      args: CHROME_ARGS,
      slowMo: 15
    });

    const prevBookList = await getPrevBookList(csvFileName[mode]);
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
      let updatedBooklist = latestBookList; // Initialize

      if (!skipFetchingBiblioInfo) {
        // Check the flag
        try {
          console.log(`${JOB_NAME}: Fetching bibliographic information`);
          updatedBooklist = await fetchBiblioInfo(latestBookList, {
            // Update if fetched
            cinii: cinii_appid,
            google: google_books_api_key,
            isbnDb: isbnDb_api_key
          }); //書誌情報取得
        } catch (error) {
          console.error(`${JOB_NAME}: Error fetching bibliographic information:`, error);
          // If fetching fails, updatedBooklist remains latestBookList (as initialized)
        }
      } else {
        console.log(`${JOB_NAME}: Skipping bibliographic information fetch.`); // Optional: Add a log message
      }

      // まずSQLiteに保存
      if (book.hasChanges) {
        try {
          console.log(`${JOB_NAME}: Crawling Kinokuniya for book descriptions`);
          // Pass the in-memory BookList directly to crawlKinokuniya instead of loading from CSV
          await crawlKinokuniya(updatedBooklist, mode);

          console.log(`${JOB_NAME}: Saving data to SQLite database`);
          await saveBookListToDatabase(updatedBooklist, mode);

          // SQLiteデータベースからCSVを生成 (カラムを指定)
          console.log(`${JOB_NAME}: Generating CSV from SQLite database`);
          await exportDatabaseTableToCsv(mode, csvFileName[mode], CSV_EXPORT_COLUMNS[mode]); // Pass columns
          console.log(`${JOB_NAME}: Finished writing ${csvFileName[mode]}`);

          // SQLiteデータベースをFirebase Storageにアップロード
          await uploadDatabaseToFirebase();
        } catch (error) {
          console.error(`${JOB_NAME}: Error during data processing or export:`, error);

          // エラー発生時はフォールバックとして直接CSVに保存
          try {
            console.log(
              `${JOB_NAME}: Error occurred, falling back to direct CSV export (using all columns except description)`
            );
            // フォールバック時は description を除いた全カラムを出力する
            const fallbackPayload = Array.from(updatedBooklist.values()).map((book) => {
              const { description, ...rest } = book;
              return rest;
            });
            await exportFile({
              fileName: csvFileName[mode],
              payload: fallbackPayload, // Use the modified payload
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
