import path from "path";

import { config } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { mapToArray, exportFile } from "../.libs/utils";

import { Bookmaker } from "./bookmaker";
import { JOB_NAME, BOOKMETER_DEFAULT_USER_ID } from "./constants";
import { fetchBiblioInfo } from "./fetchers";
import { buildCsvFileName, getPrevBookList, isBookListDifferent } from "./utils";

import type { BookList, MainFuncOption } from "./types";

config({ path: path.join(__dirname, "../.env") });
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
  skipBookListComparison = false
}: MainFuncOption) {
  try {
    const startTime = Date.now();
    const csvFileName = buildCsvFileName(userId, outputFilePath);
    if (noRemoteCheck) {
      console.log(`${JOB_NAME}: To check the remote is disabled`);
    }

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
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

    if (isBookListDifferent(latestBookList, prevBookList, skipBookListComparison)) {
      console.log(`${JOB_NAME}: Fetching bibliographic information`);
      const updatedBooklist = await fetchBiblioInfo(latestBookList, {
        cinii: cinii_appid,
        google: google_books_api_key,
        isbnDb: isbnDb_api_key
      }); //書誌情報取得

      await exportFile({
        fileName: csvFileName[mode],
        payload: mapToArray(updatedBooklist),
        targetType: "csv",
        mode: "overwrite"
      }).then(() => {
        console.log(`${JOB_NAME}: Finished writing ${csvFileName[mode]}`);
      });
    }

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
}

// usecases: https://gist.github.com/stepney141/8d3f194c15122f0134cb87b2b10708f8
(async () => {
  const mode = parseArgv(process.argv);

  await main({ mode });
})();
