import fs from "node:fs/promises";
import path from "path";

import axios from "axios";
import { config } from "dotenv";
import { launch } from "puppeteer";

import { getNodeProperty, $x } from "../.libs/pptr-utils";
import { PromiseQueue, mapToArray, randomWait, sleep, exportFile, extractTextFromPDF } from "../.libs/utils";

import {
  CSV_FILENAME,
  JOB_NAME,
  REGEX,
  XPATH,
  bookmeter_baseURI,
  bookmeter_userID,
  MATH_LIB_BOOKLIST,
  CINII_TARGETS,
  CINII_TARGET_TAGS
} from "./constants";
import { bulkFetchOpenBD, fetchGoogleBooks, fetchNDL, searchCiNii, searchSophiaMathLib } from "./fetchers";
import { getPrevBookList, isBookListDifferent, matchASIN } from "./utils";

import type { ASIN, Book, BookList, BiblioInfoStatus, ISBN10 } from "./types";
import type { AxiosResponse } from "axios";
import type { Browser } from "puppeteer";

config({ path: path.join(__dirname, "../.env") });
const bookmeter_username = process.env.BOOKMETER_ACCOUNT!.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD!.toString();
const cinii_appid = process.env.CINII_API_APPID!.toString();
const google_books_api_key = process.env.GOOGLE_BOOKS_API_KEY!.toString();

class Bookmaker {
  #browser: Browser;
  #bookList: BookList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#bookList = new Map();
  }

  /**
   * Amazon詳細リンクはアカウントにログインしなければ表示されないため、ログインする
   */
  async login() {
    const page = await this.#browser.newPage();

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      (async () => {
        if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
          await interceptedRequest.abort();
        } else {
          await interceptedRequest.continue();
        }
      })();
    });

    await page.goto(`${bookmeter_baseURI}/login`, {
      waitUntil: "domcontentloaded"
    });

    const accountNameInputHandle = await $x(page, XPATH.accountNameInput);
    const passwordInputHandle = await $x(page, XPATH.passwordInput);
    const loginButtonHandle = await $x(page, XPATH.loginButton);

    await accountNameInputHandle[0].type(bookmeter_username);
    await passwordInputHandle[0].type(bookmeter_password);

    await Promise.all([
      page.waitForNavigation({
        timeout: 2 * 60 * 1000,
        waitUntil: "domcontentloaded"
      }),
      loginButtonHandle[0].click()
      // ref: https://github.com/puppeteer/puppeteer/issues/8852
    ]);

    console.log(`${JOB_NAME}: Login Completed!`);
    return this;
  }

  async explore(): Promise<Map<string, Book>> {
    const page = await this.#browser.newPage();
    let pageNum = 1;

    console.log(`${JOB_NAME}: Scraping Started!`);

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      (async () => {
        if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
          await interceptedRequest.abort();
        } else {
          await interceptedRequest.continue();
        }
      })();
    });

    for (;;) {
      await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/wish?page=${pageNum}`, {
        waitUntil: ["domcontentloaded"]
      });

      const booksUrlHandle = await $x(page, XPATH.booksUrl);
      const amazonLinkHandle = await $x(page, XPATH.amazonLink);
      const isBookExistHandle = await $x(page, XPATH.isBookExist);

      for (let i = 0; i < booksUrlHandle.length; i++) {
        const bkmt_raw = await getNodeProperty(booksUrlHandle[i], "href");
        const bkmt = String(bkmt_raw); //本の情報のbookmeter内部リンクを取得

        const amzn_raw: string = await getNodeProperty(amazonLinkHandle[i], "href");
        const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN | null;

        this.#bookList.set(bkmt, {
          //bookmeterの内部リンクをMapのキーにする
          bookmeter_url: bkmt,
          isbn_or_asin: amzn,
          book_title: "",
          author: "",
          publisher: "",
          published_date: "",
          exist_in_Sophia: "No",
          exist_in_UTokyo: "No",
          sophia_opac: "",
          utokyo_opac: "",
          sophia_mathlib_opac: "",
          description: ""
        });
      }

      console.log(`scanning page ${pageNum}`);

      // XPathで本の情報を取得し、そのelementHandleに要素が存在しなければループから抜ける
      if (isBookExistHandle.length == 0) {
        break;
      } else {
        pageNum++;
      }
    }
    console.log(`${JOB_NAME}: Bookmeter Scraping Completed!`);

    return this.#bookList;
  }
}

const configMathlibBookList = async (listtype: keyof typeof MATH_LIB_BOOKLIST): Promise<Set<string>> => {
  const pdfUrl = MATH_LIB_BOOKLIST[listtype];
  const mathlibIsbnList: Set<string> = new Set();

  const filename = `mathlib_${listtype}.txt`;
  const filehandle = await fs.open(filename, "w");

  for (const url of pdfUrl) {
    const response: AxiosResponse<Uint8Array> = await axios({
      method: "get",
      url,
      responseType: "arraybuffer",
      headers: {
        "Content-Type": "application/pdf"
      }
    });

    const rawPdf: Uint8Array = new Uint8Array(response["data"]);
    const parsedPdf = extractTextFromPDF(rawPdf);

    console.log(`${JOB_NAME}: Completed fetching the list of ${listtype} books in Sophia Univ. Math Lib`);

    for await (const page of parsedPdf) {
      const matchedIsbn = page.matchAll(REGEX.isbn);
      for (const match of matchedIsbn) {
        mathlibIsbnList.add(match[0]);
        await filehandle.appendFile(`${match[0]}\n`);
      }
    }
  }

  await filehandle.close();

  console.log(`${JOB_NAME}: Completed creating a list of ISBNs of ${listtype} books in Sophia Univ. Math Lib`);
  return mathlibIsbnList;
};

const fetchBiblioInfo = async (booklist: BookList): Promise<BookList> => {
  const mathLibIsbnList = await configMathlibBookList("ja");

  const updatedBookList = await bulkFetchOpenBD(booklist);

  const fetchOthers = async (bookInfo: BiblioInfoStatus) => {
    let updatedBook = { ...bookInfo };

    // NDL検索
    if (!updatedBook.isFound) {
      updatedBook = await fetchNDL(updatedBook.book);
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    // GoogleBooks検索
    if (!updatedBook.isFound) {
      updatedBook = await fetchGoogleBooks(updatedBook.book, google_books_api_key);
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    // CiNii所蔵検索
    for (const tag of CINII_TARGET_TAGS) {
      const library = CINII_TARGETS.find((library) => library.tag === tag)!;
      const ciniiStatus = await searchCiNii(
        {
          book: updatedBook.book,
          options: { libraryInfo: library }
        },
        cinii_appid
      );
      if (ciniiStatus.isOwning) {
        updatedBook.book = ciniiStatus.book;
      }
    }

    // 数学図書館所蔵検索
    const smlStatus = searchSophiaMathLib({
      book: updatedBook.book,
      options: { resources: mathLibIsbnList }
    });
    if (smlStatus.isOwning) {
      updatedBook.book = smlStatus.book;
    }

    booklist.set(updatedBook.book.bookmeter_url, updatedBook.book);
  };

  const ps = PromiseQueue();
  for (const book of updatedBookList) {
    ps.add(fetchOthers(book));
    await ps.wait(5); // 引数の指定量だけ並列実行
  }
  await ps.all(); // 端数分の処理の待ち合わせ

  console.log(`${JOB_NAME}: Searching Completed`);
  return new Map(booklist);
};

(async () => {
  try {
    const startTime = Date.now();
    const noRemoteCheck = false; // default: false
    const skipBookListComparison = false; // default: false
    if (noRemoteCheck) {
      console.log(`${JOB_NAME}: To check the remote is disabled`);
    }

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      slowMo: 15
    });

    const book = new Bookmaker(browser);
    const prevBookList = await getPrevBookList(CSV_FILENAME);
    const latestBookList = noRemoteCheck ? prevBookList : await book.login().then((book) => book.explore());

    await browser.close();

    if (isBookListDifferent(latestBookList, prevBookList, skipBookListComparison)) {
      console.log(`${JOB_NAME}: Fetching bibliographic information`);
      const updatedBooklist = await fetchBiblioInfo(latestBookList); //書誌情報取得

      await exportFile({
        fileName: CSV_FILENAME,
        payload: mapToArray(updatedBooklist),
        targetType: "csv",
        mode: "overwrite"
      }).then(() => {
        console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
      });
    }

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
