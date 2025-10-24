import { getNodeProperty, $x, waitForXPath } from "../../../../.libs/pptr-utils";
import { sleep } from "../../../../.libs/utils";
import { BOOKMETER_BASE_URI, XPATH } from "../../constants";
import { matchASIN } from "../../domain/valueObjects";

import type { BookListMode, BookListScraper, ScrapeOptions } from "../../application/ports";
import type { ASIN, Book, BookList, ISBN10 } from "../../domain/types";
import type { Browser, HTTPRequest, Page } from "puppeteer";

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

type PageRunner = <T>(context: string, task: (page: Page) => Promise<T>) => Promise<T>;

type Authenticator = (credentials: BookmeterCredentials) => Promise<void>;

type BookScanner = (bookmeterUrl: string) => Promise<Book>;

type WishBookListFetcher = (isSignedIn: boolean) => Promise<BookList>;

type StackedBookListFetcher = () => Promise<BookList>;

type ScrapeExecutor = (mode: BookListMode, options: ScrapeOptions) => Promise<BookList>;

const createPageRunner = (browser: Browser): PageRunner => {
  return async (context, task) => {
    const page = await browser.newPage();

    try {
      await configureNetworkInterception(page, context);
      return await task(page);
    } finally {
      await page.close();
    }
  };
};

const configureNetworkInterception = async (page: Page, context: string): Promise<void> => {
  await page.setRequestInterception(true);
  page.on("request", createRequestHandler(context));
};

const createRequestHandler = (context: string) => {
  return (interceptedRequest: HTTPRequest) => {
    (async () => {
      const url = interceptedRequest.url();
      const isImage = url.endsWith(".png") || url.endsWith(".jpg");

      if (isImage) {
        await interceptedRequest.abort();
        return;
      }

      await interceptedRequest.continue();
    })().catch((error) => {
      console.error(`Failed to continue intercepted request ${context}:`, error);
    });
  };
};

const createAuthenticator = (runWithPage: PageRunner, baseUri: string): Authenticator => {
  return async ({ username, password }) => {
    await runWithPage("during login", async (page) => {
      await page.goto(`${baseUri}/login`, { waitUntil: "domcontentloaded" });

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
    });
  };
};

const createBookScanner = (runWithPage: PageRunner): BookScanner => {
  return async (bookmeterUrl) => {
    return await runWithPage("while scanning book", async (page) => {
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
    });
  };
};

const createWishBookListFetcher = ({
  runWithPage,
  baseUri,
  userId,
  scanBook
}: {
  runWithPage: PageRunner;
  baseUri: string;
  userId: string;
  scanBook: BookScanner;
}): WishBookListFetcher => {
  return async (isSignedIn) => {
    if (isSignedIn) {
      return await runWithPage("while fetching wish books as a signed-in user", async (page) => {
        const wishBookList: BookList = new Map();
        let pageNum = 1;

        for (;;) {
          await page.goto(`${baseUri}/users/${userId}/books/wish?page=${pageNum}`, {
            waitUntil: ["domcontentloaded"]
          });

          const booksUrlHandle = await $x(page, XPATH.wish.login.booksUrl);
          const amazonLinkHandle = await $x(page, XPATH.wish.login.amazonLink);
          const isBookExistHandle = await $x(page, XPATH.wish.login.isBookExist);

          for (let i = 0; i < booksUrlHandle.length; i++) {
            const bookmeterUrl = String(await getNodeProperty(booksUrlHandle[i], "href"));
            const amazonUrl = String(await getNodeProperty(amazonLinkHandle[i], "href"));
            const asin = matchASIN(amazonUrl) as ISBN10 | ASIN;

            wishBookList.set(bookmeterUrl, createEmptyBook(bookmeterUrl, asin));
          }

          if (isBookExistHandle.length === 0) {
            break;
          }

          pageNum++;
        }

        return wishBookList;
      });
    }

    return await runWithPage("while fetching wish books as a guest", async (page) => {
      const wishBookList: BookList = new Map();
      let pageNum = 1;
      let processedCount = 0;
      let waitSeconds = 1.5;

      for (;;) {
        await page.goto(`${baseUri}/users/${userId}/books/wish?page=${pageNum}`, {
          waitUntil: ["domcontentloaded"]
        });

        const booksUrlHandle = await $x(page, XPATH.wish.guest.booksUrl);
        if (booksUrlHandle.length === 0) {
          break;
        }
        pageNum++;

        for (const node of booksUrlHandle) {
          const bookmeterUrl = String(await getNodeProperty(node, "href"));
          const book = await scanBook(bookmeterUrl);
          wishBookList.set(bookmeterUrl, book);

          processedCount++;
          await sleep(waitSeconds * 1000);

          if (BigInt(processedCount) % 10n === 0n && waitSeconds < 5.5) {
            waitSeconds += 0.2;
          }
        }

        await sleep(40 * 1000);
      }

      return wishBookList;
    });
  };
};

const createStackedBooksFetcher = ({
  runWithPage,
  baseUri,
  userId,
  scanBook
}: {
  runWithPage: PageRunner;
  baseUri: string;
  userId: string;
  scanBook: BookScanner;
}): StackedBookListFetcher => {
  return async () => {
    return await runWithPage("while fetching stacked books", async (page) => {
      const stackedBookList: BookList = new Map();
      let pageNum = 1;

      for (;;) {
        await page.goto(`${baseUri}/users/${userId}/books/stacked?page=${pageNum}`, {
          waitUntil: ["domcontentloaded"]
        });

        const booksUrlHandle = await $x(page, XPATH.stacked.booksUrl);
        if (booksUrlHandle.length === 0) {
          break;
        }
        pageNum++;

        for (const node of booksUrlHandle) {
          const bookmeterUrl = String(await getNodeProperty(node, "href"));
          const book = await scanBook(bookmeterUrl);
          stackedBookList.set(bookmeterUrl, book);
        }
      }

      return stackedBookList;
    });
  };
};

const createScrapeExecutor = ({
  login,
  fetchWishBooks,
  fetchStackedBooks,
  credentials
}: {
  login: Authenticator;
  fetchWishBooks: WishBookListFetcher;
  fetchStackedBooks: StackedBookListFetcher;
  credentials?: BookmeterCredentials;
}): ScrapeExecutor => {
  return async (mode, options) => {
    const { requireLogin } = options;

    if (requireLogin) {
      if (!credentials) {
        throw new Error("Bookmeter credentials are required to perform an authenticated scrape.");
      }

      await login(credentials);
    }

    if (mode === "wish") {
      return await fetchWishBooks(requireLogin);
    }

    if (mode === "stacked") {
      return await fetchStackedBooks();
    }

    const exhaustiveCheck: never = mode;
    throw new Error(`Unsupported mode supplied to createPuppeteerBookListScraper: ${exhaustiveCheck satisfies never}`);
  };
};

const createEmptyBook = (bookmeterUrl: string, isbnOrAsin: ISBN10 | ASIN): Book => {
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
};

export function createPuppeteerBookListScraper({
  browser,
  userId,
  baseUri = BOOKMETER_BASE_URI,
  credentials
}: Dependencies): BookListScraper {
  const runWithPage = createPageRunner(browser);
  const login = createAuthenticator(runWithPage, baseUri);
  const scanBook = createBookScanner(runWithPage);
  const fetchWishBooks = createWishBookListFetcher({
    runWithPage,
    baseUri,
    userId,
    scanBook
  });
  const fetchStackedBooks = createStackedBooksFetcher({
    runWithPage,
    baseUri,
    userId,
    scanBook
  });
  const scrape = createScrapeExecutor({
    login,
    fetchWishBooks,
    fetchStackedBooks,
    credentials
  });

  return {
    scrape: async (mode: BookListMode, options: ScrapeOptions) => {
      return await scrape(mode, options);
    }
  };
}
