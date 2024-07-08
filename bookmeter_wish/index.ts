import path from "path";

import { config } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { getNodeProperty, $x, waitForXPath } from "../.libs/pptr-utils";
import { mapToArray, exportFile, sleep } from "../.libs/utils";

import { JOB_NAME, XPATH, BOOKMETER_BASE_URI, BOOKMETER_DEFAULT_USER_ID } from "./constants";
import { fetchBiblioInfo } from "./fetchers";
import { buildCsvFileName, getPrevBookList, isBookListDifferent, matchASIN } from "./utils";

import type { ASIN, Book, BookList, ISBN10 } from "./types";
import type { Browser, Page } from "puppeteer";

config({ path: path.join(__dirname, "../.env") });
const bookmeter_username = process.env.BOOKMETER_ACCOUNT!.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD!.toString();
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

class Bookmaker {
  #browser: Browser;
  #userId: string;
  #wishBookList: BookList;
  #stackedBookList: BookList;

  constructor(browser: Browser, userId: string) {
    this.#browser = browser;
    this.#userId = userId;
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

    await page.goto(`${BOOKMETER_BASE_URI}/login`, {
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

    await Promise.all([
      waitForXPath(page, XPATH.book.amazonLink, {
        timeout: 2 * 60 * 1000
      }),
      page.goto(bookmeterUrl)
    ]);

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

  async #getWishBooks(page: Page, isSignedIn: boolean): Promise<Map<string, Book>> {
    let pageNum = 1;

    if (isSignedIn) {
      for (;;) {
        await page.goto(`${BOOKMETER_BASE_URI}/users/${this.#userId}/books/wish?page=${pageNum}`, {
          waitUntil: ["domcontentloaded"]
        });

        const booksUrlHandle = await $x(page, XPATH.wish.login.booksUrl);
        const amazonLinkHandle = await $x(page, XPATH.wish.login.amazonLink);
        const isBookExistHandle = await $x(page, XPATH.wish.login.isBookExist);

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
    } else {
      let cnt = 0;
      let sec = 1;

      for (;;) {
        await page.goto(`${BOOKMETER_BASE_URI}/users/${this.#userId}/books/wish?page=${pageNum}`, {
          waitUntil: ["domcontentloaded"]
        });

        const booksUrlHandle = await $x(page, XPATH.wish.guest.booksUrl);
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
          this.#wishBookList.set(bkmt, book);

          cnt++;
          await sleep(sec * 1000);

          if (BigInt(cnt) % 10n === 0n) {
            sec += 0.2;
            console.log("wait: + 0.2ms");

            console.log("sleeping for 10s...");
            console.log(`current wait: ${sec}ms`);
            await sleep(10 * 1000);
          }
        }

        await sleep(30 * 1000);
      }
    }

    console.log(`${JOB_NAME}: Bookmeter Scraping Completed!`);
    return this.#wishBookList;
  }

  async #getStackedBooks(page: Page): Promise<Map<string, Book>> {
    let pageNum = 1;

    for (;;) {
      await page.goto(`${BOOKMETER_BASE_URI}/users/${BOOKMETER_DEFAULT_USER_ID}/books/stacked?page=${pageNum}`, {
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

  async explore(mode: "wish" | "stacked", isSignedIn: boolean): Promise<Map<string, Book>> {
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
      return await this.#getWishBooks(page, isSignedIn);
    }
    if (mode === "stacked") {
      return await this.#getStackedBooks(page);
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

async function main(userId: string, doLogin: boolean) {
  try {
    const startTime = Date.now();
    const mode = parseArgv(process.argv);
    const csvFileName = buildCsvFileName(userId);

    const noRemoteCheck = false; // default: false
    const skipBookListComparison = false; // default: false
    if (noRemoteCheck) {
      console.log(`${JOB_NAME}: To check the remote is disabled`);
    }

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      slowMo: 15
    });

    const book = new Bookmaker(browser, userId);
    const prevBookList = await getPrevBookList(csvFileName[mode]);
    if (prevBookList === null && noRemoteCheck) {
      throw new Error("前回データが存在しないのにリモートチェックをオフにすることは出来ません");
    }

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

(async () => {
  const users = ["1503969", "1504818", "1504820", "1504793", "1504772", "1504804", "1504789"];
  for (const id of users) {
    await main(id, false);
  }
})();
