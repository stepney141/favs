import { getNodeProperty, $x, waitForXPath } from "../../../../.libs/pptr-utils";
import { sleep } from "../../../../.libs/utils";
import { matchASIN } from "../../domain/book-id";

import { XPATH } from "./selector";

import type { ScrapeOptions } from "../../interface/ports";
import type { BookCollection } from "@/domain/repositories/bookRepository";
import type { BookCollectionMode, BookmeterUrl } from "@/domain/types";
import type { Browser, HTTPRequest, Page } from "puppeteer";

import { createNewBook, type Book } from "@/domain/entities/book";
import { wishedBookCollection } from "@/domain/repositories/bookRepository";

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
type BookScanner = (bookmeterUrl: BookmeterUrl) => Promise<Book>;
type WishBookCollectionFetcher = (isSignedIn: boolean) => Promise<BookCollection>;
type StackedBookCollectionFetcher = () => Promise<BookCollection>;
type ScrapeExecutor = (mode: BookCollectionMode, options: ScrapeOptions) => Promise<BookCollection>;

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
  page.on("request", (interceptedRequest: HTTPRequest) => {
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
  });
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
  return async (bookmeterUrl: BookmeterUrl) => {
    return await runWithPage("while scanning book", async (page): Promise<Book> => {
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
      const asin = matchASIN(amazonUrl);

      return createNewBook({
        bookmeter_url: bookmeterUrl,
        isbn_or_asin: asin,
        book_title: title,
        author
      });
    });
  };
};

const createWishBookCollectionFetcher = ({
  runWithPage,
  baseUri,
  userId,
  scanBook
}: {
  runWithPage: PageRunner;
  baseUri: string;
  userId: string;
  scanBook: BookScanner;
}): WishBookCollectionFetcher => {
  return async (isSignedIn) => {
    if (isSignedIn) {
      return await runWithPage("while fetching wish books as a signed-in user", async (page) => {
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
            const asin = matchASIN(amazonUrl);

            wishedBookCollection.set(bookmeterUrl, createEmptyBook(bookmeterUrl, asin));
          }

          if (isBookExistHandle.length === 0) {
            break;
          }

          pageNum++;
        }

        return wishedBookCollection;
      });
    }

    return await runWithPage("while fetching wish books as a guest", async (page) => {
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
          wishedBookCollection.upsert(book);

          processedCount++;
          await sleep(waitSeconds * 1000);

          if (BigInt(processedCount) % 10n === 0n && waitSeconds < 5.5) {
            waitSeconds += 0.2;
          }
        }

        await sleep(40 * 1000);
      }

      return wishedBookCollection;
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
}): StackedBookCollectionFetcher => {
  return async () => {
    return await runWithPage("while fetching stacked books", async (page) => {
      const stackedBookCollection: BookCollection = new Map();
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
          stackedBookCollection.set(bookmeterUrl, book);
        }
      }

      return stackedBookCollection;
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
  fetchWishBooks: WishBookCollectionFetcher;
  fetchStackedBooks: StackedBookCollectionFetcher;
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
    throw new Error(
      `Unsupported mode supplied to createPuppeteerBookCollectionScraper: ${exhaustiveCheck satisfies never}`
    );
  };
};

export function createPuppeteerBookCollectionScraper({
  browser,
  userId,
  baseUri = BOOKMETER_BASE_URI,
  credentials
}: Dependencies): BookCollectionScraper {
  const runWithPage = createPageRunner(browser);
  const login = createAuthenticator(runWithPage, baseUri);
  const scanBook = createBookScanner(runWithPage);
  const fetchWishBooks = createWishBookCollectionFetcher({
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
    scrape: async (mode: BookCollectionMode, options: ScrapeOptions) => {
      return await scrape(mode, options);
    }
  };
}
