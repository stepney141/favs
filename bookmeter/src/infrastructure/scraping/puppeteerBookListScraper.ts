import { getNodeProperty, $x, waitForXPath } from "../../../../.libs/pptr-utils";
import { sleep } from "../../../../.libs/utils";
import { BOOKMETER_BASE_URI, XPATH } from "../../constants";
import { matchASIN } from "../../domain/valueObjects";

import type { BookListMode, BookListScraper, ScrapeOptions } from "../../application/ports";
import type { ASIN, Book, BookList, ISBN10 } from "../../domain/types";
import type { Browser } from "puppeteer";

type BookmeterCredentials = {
  username: string;
  password: string;
};

type Dependencies = {
  browser: Browser;
  userId: string;
  baseUri?: string;
  credentials?: BookmeterCredentials;
};

class PuppeteerBookmaker {
  #browser: Browser;
  #userId: string;
  #baseUri: string;
  #credentials?: BookmeterCredentials;

  constructor({ browser, userId, baseUri = BOOKMETER_BASE_URI, credentials }: Dependencies) {
    this.#browser = browser;
    this.#userId = userId;
    this.#baseUri = baseUri;
    this.#credentials = credentials;
  }

  async scrape(mode: BookListMode, options: ScrapeOptions): Promise<BookList> {
    const { requireLogin } = options;

    if (requireLogin) {
      if (!this.#credentials) {
        throw new Error("Bookmeter credentials are required to perform an authenticated scrape.");
      }
      await this.login(this.#credentials);
    }

    if (mode === "wish") {
      return await this.fetchWishBooks(requireLogin);
    }

    if (mode === "stacked") {
      return await this.fetchStackedBooks();
    }

    const exhaustiveCheck: never = mode;
    throw new Error(`Unsupported mode supplied to PuppeteerBookmaker: ${exhaustiveCheck satisfies never}`);
  }

  private async login({ username, password }: BookmeterCredentials): Promise<void> {
    const page = await this.#browser.newPage();

    try {
      await page.setRequestInterception(true);
      page.on("request", (interceptedRequest) => {
        (async () => {
          if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
            await interceptedRequest.abort();
          } else {
            await interceptedRequest.continue();
          }
        })().catch((error) => {
          console.error("Failed to continue intercepted request during login:", error);
        });
      });

      await page.goto(`${this.#baseUri}/login`, { waitUntil: "domcontentloaded" });

      const accountNameInputHandle = await $x(page, XPATH.login.accountNameInput);
      const passwordInputHandle = await $x(page, XPATH.login.passwordInput);
      const loginButtonHandle = await $x(page, XPATH.login.loginButton);

      await accountNameInputHandle[0].type(username);
      await passwordInputHandle[0].type(password);

      await Promise.all([
        page.waitForNavigation({
          timeout: 2 * 60 * 1000,
          waitUntil: "domcontentloaded"
        }),
        loginButtonHandle[0].click()
      ]);
    } finally {
      await page.close();
    }
  }

  private async fetchWishBooks(isSignedIn: boolean): Promise<BookList> {
    const page = await this.#browser.newPage();
    const wishBookList: BookList = new Map();

    try {
      await page.setRequestInterception(true);
      page.on("request", (interceptedRequest) => {
        (async () => {
          if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
            await interceptedRequest.abort();
          } else {
            await interceptedRequest.continue();
          }
        })().catch((error) => {
          console.error("Failed to continue intercepted request while fetching wish books:", error);
        });
      });

      if (isSignedIn) {
        let pageNum = 1;
        // Authenticated users can read Amazon links directly from the list view.
        for (;;) {
          await page.goto(`${this.#baseUri}/users/${this.#userId}/books/wish?page=${pageNum}`, {
            waitUntil: ["domcontentloaded"]
          });

          const booksUrlHandle = await $x(page, XPATH.wish.login.booksUrl);
          const amazonLinkHandle = await $x(page, XPATH.wish.login.amazonLink);
          const isBookExistHandle = await $x(page, XPATH.wish.login.isBookExist);

          for (let i = 0; i < booksUrlHandle.length; i++) {
            const bookmeterUrl = String(await getNodeProperty(booksUrlHandle[i], "href"));
            const amazonUrl = String(await getNodeProperty(amazonLinkHandle[i], "href"));
            const asin = matchASIN(amazonUrl) as ISBN10 | ASIN;

            wishBookList.set(bookmeterUrl, this.createEmptyBook(bookmeterUrl, asin));
          }

          if (isBookExistHandle.length === 0) {
            break;
          }

          pageNum++;
        }
      } else {
        // Visitors need to open each book page to resolve the Amazon link.
        let pageNum = 1;
        let processedCount = 0;
        let waitSeconds = 1.5;

        for (;;) {
          await page.goto(`${this.#baseUri}/users/${this.#userId}/books/wish?page=${pageNum}`, {
            waitUntil: ["domcontentloaded"]
          });

          const booksUrlHandle = await $x(page, XPATH.wish.guest.booksUrl);
          if (booksUrlHandle.length === 0) {
            break;
          }
          pageNum++;

          for (const node of booksUrlHandle) {
            const bookmeterUrl = String(await getNodeProperty(node, "href"));
            const book = await this.scanEachBook(bookmeterUrl);
            wishBookList.set(bookmeterUrl, book);

            processedCount++;
            await sleep(waitSeconds * 1000);

            if (BigInt(processedCount) % 10n === 0n && waitSeconds < 5.5) {
              waitSeconds += 0.2;
            }
          }

          await sleep(40 * 1000);
        }
      }
    } finally {
      await page.close();
    }

    return wishBookList;
  }

  private async fetchStackedBooks(): Promise<BookList> {
    const page = await this.#browser.newPage();
    const stackedBookList: BookList = new Map();

    try {
      await page.setRequestInterception(true);
      page.on("request", (interceptedRequest) => {
        (async () => {
          if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
            await interceptedRequest.abort();
          } else {
            await interceptedRequest.continue();
          }
        })().catch((error) => {
          console.error("Failed to continue intercepted request while fetching stacked books:", error);
        });
      });

      let pageNum = 1;
      for (;;) {
        await page.goto(`${this.#baseUri}/users/${this.#userId}/books/stacked?page=${pageNum}`, {
          waitUntil: ["domcontentloaded"]
        });

        const booksUrlHandle = await $x(page, XPATH.stacked.booksUrl);
        if (booksUrlHandle.length === 0) {
          break;
        }
        pageNum++;

        for (const node of booksUrlHandle) {
          const bookmeterUrl = String(await getNodeProperty(node, "href"));
          const book = await this.scanEachBook(bookmeterUrl);
          stackedBookList.set(bookmeterUrl, book);
        }
      }
    } finally {
      await page.close();
    }

    return stackedBookList;
  }

  private async scanEachBook(bookmeterUrl: string): Promise<Book> {
    const page = await this.#browser.newPage();

    try {
      await page.setRequestInterception(true);
      page.on("request", (interceptedRequest) => {
        (async () => {
          if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
            await interceptedRequest.abort();
          } else {
            await interceptedRequest.continue();
          }
        })().catch((error) => {
          console.error("Failed to continue intercepted request while scanning book:", error);
        });
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

      const amazonUrl = await getNodeProperty(amazonLinkHandle[0], "href");
      const author = await getNodeProperty(authorHandle[0], "textContent");
      const title = await getNodeProperty(titleHandle[0], "textContent");
      const asin = matchASIN(amazonUrl) as ISBN10 | ASIN;

      return {
        bookmeter_url: bookmeterUrl,
        isbn_or_asin: asin,
        book_title: title,
        author,
        publisher: "",
        published_date: "",
        exist_in_sophia: "No",
        exist_in_utokyo: "No",
        sophia_opac: "",
        utokyo_opac: "",
        sophia_mathlib_opac: "",
        description: ""
      };
    } finally {
      await page.close();
    }
  }

  private createEmptyBook(bookmeterUrl: string, isbnOrAsin: ISBN10 | ASIN): Book {
    return {
      bookmeter_url: bookmeterUrl,
      isbn_or_asin: isbnOrAsin,
      book_title: "",
      author: "",
      publisher: "",
      published_date: "",
      exist_in_sophia: "No",
      exist_in_utokyo: "No",
      sophia_opac: "",
      utokyo_opac: "",
      sophia_mathlib_opac: "",
      description: ""
    };
  }
}

export function createPuppeteerBookListScraper(dependencies: Dependencies): BookListScraper {
  const scraper = new PuppeteerBookmaker(dependencies);

  return {
    scrape: async (mode: BookListMode, options: ScrapeOptions) => {
      return await scraper.scrape(mode, options);
    }
  };
}
