import path from "path";

import { config } from "dotenv";

import { getNodeProperty, $x, waitForXPath } from "../.libs/pptr-utils";
import { sleep } from "../.libs/utils";

import { JOB_NAME, XPATH, BOOKMETER_BASE_URI, BOOKMETER_DEFAULT_USER_ID } from "./constants";
import { matchASIN } from "./utils";

import type { ASIN, Book, BookList, ISBN10 } from "./types";
import type { Browser, Page } from "puppeteer";

config({ path: path.join(__dirname, "../.env") });
const bookmeter_username = process.env.BOOKMETER_ACCOUNT!.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD!.toString();

export class Bookmaker {
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

  async scanEachBook(
    bookmeterUrl: string,
    doRegister: { register: false } | { register: true; mode: "wish" | "stacked" } = { register: false }
  ): Promise<Book> {
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
    const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN;

    const author: string = await getNodeProperty(authorHandle[0], "textContent");
    const title: string = await getNodeProperty(titleHandle[0], "textContent");

    console.log(bookmeterUrl, amzn, title, author);

    if (doRegister.register) {
      if (doRegister.mode === "wish") {
        await $x(page, XPATH.book.registerWishBook).then((wishButtonHandle) => wishButtonHandle[0].click());
      } else if (doRegister.mode === "stacked") {
        await $x(page, XPATH.book.registerStackedBook).then((stackedButtonHandle) => stackedButtonHandle[0].click());
      }
    }

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
          const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN;

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
      /*
      未ログインでスクレイピングする場合、「読みたい本」一覧画面にAmazonのリンクが表示されない。
      そのためISBNを一括取得することが出来ず、本の数だけ個別ページにアクセスする必要がある。
      そうなるとすぐにアクセス制限がかかるため、大きめに間隔を設ける必要がある。
      */
      let cnt = 0;
      let sec = 1.5;

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
            if (sec < 5.5) {
              sec += 0.2;
              console.log("wait: + 0.2ms");
              console.log(`current wait: ${sec}ms`);
            }
          }
        }

        console.log("sleeping for 40s...");
        await sleep(40 * 1000);
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
