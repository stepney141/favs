import path from "path";

import { config } from "dotenv";
import { launch } from "puppeteer";

import { getNodeProperty, $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile } from "../.libs/utils";

import { CSV_FILENAME, JOB_NAME, XPATH, bookmeter_baseURI, bookmeter_userID } from "./constants";
import { fetchBiblioInfo } from "./fetchers";
import { getPrevBookList, isBookListDifferent, matchASIN } from "./utils";

import type { ASIN, Book, BookList, ISBN10 } from "./types";
import type { Browser } from "puppeteer";

config({ path: path.join(__dirname, "../.env") });
const bookmeter_username = process.env.BOOKMETER_ACCOUNT!.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD!.toString();
const cinii_appid = process.env.CINII_API_APPID!.toString();
const google_books_api_key = process.env.GOOGLE_BOOKS_API_KEY!.toString();

class Bookmaker {
  #browser: Browser;
  #wishBookList: BookList;
  #stackedBookList: BookList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#wishBookList = new Map(); //bookmeterの内部リンクをキーにする
    this.#stackedBookList = new Map(); //bookmeterの内部リンクをキーにする
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

    const accountNameInputHandle = await $x(page, XPATH.login.accountNameInput);
    const passwordInputHandle = await $x(page, XPATH.login.passwordInput);
    const loginButtonHandle = await $x(page, XPATH.login.loginButton);

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

  async scanEachBook(bookmeterUrl: string): Promise<Book> {
    const page = await this.#browser.newPage();
    await page.goto(bookmeterUrl, {
      timeout: 2 * 60 * 1000,
      waitUntil: ["networkidle0", "domcontentloaded", "load"]
    });

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

    const amazonLinkHandle = await $x(page, XPATH.book.amazonLink);
    const authorHandle = await $x(page, XPATH.book.author);
    const titleHandle = await $x(page, XPATH.book.title);

    const amzn_raw: string = await getNodeProperty(amazonLinkHandle[0], "href");
    const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN | null;

    const author: string = await getNodeProperty(authorHandle[0], "textContent");
    const title: string = await getNodeProperty(titleHandle[0], "textContent");

    console.log(bookmeterUrl, amzn, title, author);
    await page.close();

    return {
      bookmeter_url: bookmeterUrl,
      isbn_or_asin: amzn,
      book_title: title,
      author,
      publisher: "",
      published_date: "",
      exist_in_Sophia: "No",
      exist_in_UTokyo: "No",
      sophia_opac: "",
      utokyo_opac: "",
      sophia_mathlib_opac: "",
      description: ""
    };
  }

  async explore(mode: "wish" | "stacked"): Promise<Map<string, Book>> {
    const page = await this.#browser.newPage();

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

    if (mode === "wish") {
      let pageNum = 1;

      for (;;) {
        await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/${mode}?page=${pageNum}`, {
          waitUntil: ["domcontentloaded"]
        });

        const booksUrlHandle = await $x(page, XPATH.wish.booksUrl);
        const amazonLinkHandle = await $x(page, XPATH.wish.amazonLink);
        const isBookExistHandle = await $x(page, XPATH.wish.isBookExist);

        for (let i = 0; i < booksUrlHandle.length; i++) {
          const bkmt_raw = await getNodeProperty(booksUrlHandle[i], "href");
          const bkmt = String(bkmt_raw); //本の情報のbookmeter内部リンクを取得

          const amzn_raw: string = await getNodeProperty(amazonLinkHandle[i], "href");
          const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN | null;

          this.#wishBookList.set(bkmt, {
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

        if (isBookExistHandle.length == 0) {
          break;
        } else {
          pageNum++;
        }
      }

      console.log(`${JOB_NAME}: Bookmeter Scraping Completed!`);
      return this.#wishBookList;
    }

    if (mode === "stacked") {
      let pageNum = 1;

      for (;;) {
        await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/${mode}?page=${pageNum}`, {
          waitUntil: ["domcontentloaded"]
        });

        const booksUrlHandle = await $x(page, XPATH.stacked.booksUrl);
        if (booksUrlHandle.length === 0) {
          break;
        } else {
          console.log(`scanning page ${pageNum}`);
          pageNum++;
        }

        for (const node of booksUrlHandle) {
          const bkmt_raw = await getNodeProperty(node, "href");
          const bkmt = String(bkmt_raw);

          const book = await this.scanEachBook(bkmt);
          this.#stackedBookList.set(bkmt, book);
        }
      }

      return this.#stackedBookList;
    }

    throw new Error("Specify the process mode");
  }
}

function parseArgv(argv: string[]): "wish" | "stacked" {
  const mode = argv[2];
  if (mode === "wish" || mode === "stacked") {
    return mode;
  } else {
    throw new Error("Specify the process mode");
  }
}

(async () => {
  try {
    const startTime = Date.now();
    const mode = parseArgv(process.argv);
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
    const prevBookList = await getPrevBookList(CSV_FILENAME[mode]);
    const latestBookList = noRemoteCheck ? prevBookList : await book.login().then((book) => book.explore(mode));

    await browser.close();

    if (isBookListDifferent(latestBookList, prevBookList, skipBookListComparison)) {
      console.log(`${JOB_NAME}: Fetching bibliographic information`);
      const updatedBooklist = await fetchBiblioInfo(latestBookList, {
        cinii: cinii_appid,
        google: google_books_api_key
      }); //書誌情報取得

      await exportFile({
        fileName: CSV_FILENAME[mode],
        payload: mapToArray(updatedBooklist),
        targetType: "csv",
        mode: "overwrite"
      }).then(() => {
        console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME[mode]}`);
      });
    }

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
