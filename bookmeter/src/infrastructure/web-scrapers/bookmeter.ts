import { getNodeProperty, $x, waitForXPath } from "../../../../.libs/pptr-utils";
import { sleep } from "../../../../.libs/utils";
import { createBookRepository } from "../repositories/in-memory-book-repository";

import { bookmeterXPath } from "./selector";

import type { BookCollectionScraper, ScrapeOptions } from "../../interface/ports";
import type { Book } from "@/domain/entities/book";
import type { BookCollectionMode, BookRepository } from "@/domain/repositories/bookRepository";
import type { BookmeterUrl } from "@/domain/types";
import type { Browser, HTTPRequest, Page } from "puppeteer";

import { matchAsin, type ISBN10, type ASIN } from "@/domain/book-id";
import { Ok, Err, type Result, type AppError, ScrapeError, LoginError, NetworkError, isErr } from "@/domain/error";
import { createNewBook } from "@/domain/factories/book-factory";

const BOOKMETER_BASE_URI = "https://bookmeter.com";

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

/**
 * ネットワークインターセプションを設定する
 * Pageの内部状態を変更するだけで、新しいPageは返さない
 */
async function configureNetworkInterception(page: Page): Promise<Result<void, NetworkError>> {
  try {
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
        // イベントハンドラ内のエラーはログに記録
        console.error(`Network interception error: ${error instanceof Error ? error.message : String(error)}`);
      });
    });
    return Ok(undefined);
  } catch (error) {
    if (error instanceof Error) {
      return Err(new NetworkError(`Failed to set up network interception: ${error.message}`, error));
    }
    return Err(new NetworkError(`Failed to set up network interception: ${String(error)}`));
  }
}

/**
 * ログイン処理を行う
 * Pageの内部状態（Cookie等）を変更するだけで、新しいPageは返さない
 */
async function authenticatePage(
  page: Page,
  credentials: BookmeterCredentials
): Promise<Result<Page, LoginError | NetworkError>> {
  try {
    await page.goto(`${BOOKMETER_BASE_URI}/login`, { waitUntil: "domcontentloaded" });

    const accountNameInputHandle = await $x(page, bookmeterXPath.login.accountNameInput);
    const passwordInputHandle = await $x(page, bookmeterXPath.login.passwordInput);
    const loginButtonHandle = await $x(page, bookmeterXPath.login.loginButton);

    if (!accountNameInputHandle[0] || !passwordInputHandle[0] || !loginButtonHandle[0]) {
      return Err(new LoginError("Login form elements not found on the page"));
    }

    await accountNameInputHandle[0].type(credentials.username);
    await passwordInputHandle[0].type(credentials.password);

    await Promise.all([
      page.waitForNavigation({
        timeout: 2 * 60 * 1000,
        waitUntil: "domcontentloaded"
      }),
      loginButtonHandle[0].click()
    ]);

    return Ok(page);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Navigation timeout") || error.message.includes("net::")) {
        return Err(new NetworkError(`Failed to navigate during login: ${error.message}`, error));
      }
      return Err(new LoginError(`Login failed: ${error.message}`));
    }
    return Err(new LoginError(`Login failed with unknown error: ${String(error)}`));
  }
}

/**
 * 1冊の書籍情報をスキャンする
 */
async function scanBook(page: Page, bookmeterUrl: BookmeterUrl): Promise<Result<Book, ScrapeError | NetworkError>> {
  try {
    await Promise.all([
      waitForXPath(page, bookmeterXPath.book.amazonLink, {
        timeout: 2 * 60 * 1000
      }),
      page.goto(bookmeterUrl as string)
    ]);

    const amazonLinkHandle = await $x(page, bookmeterXPath.book.amazonLink);
    const authorHandle = await $x(page, bookmeterXPath.book.author);
    const titleHandle = await $x(page, bookmeterXPath.book.title);

    if (!amazonLinkHandle[0] || !authorHandle[0] || !titleHandle[0]) {
      return Err(new ScrapeError("Required book elements not found on page", bookmeterUrl as string));
    }

    const amazonUrl = await getNodeProperty(amazonLinkHandle[0], "href");
    const author = await getNodeProperty(authorHandle[0], "textContent");
    const title = await getNodeProperty(titleHandle[0], "textContent");
    const asinString = matchAsin(amazonUrl);

    if (!asinString) {
      return Err(new ScrapeError(`Failed to extract ASIN from Amazon URL: ${amazonUrl}`, bookmeterUrl as string));
    }

    const book = createNewBook({
      bookmeterUrl: bookmeterUrl,
      isbnOrAsin: asinString as ISBN10 | ASIN,
      title: title,
      author
    });

    return Ok(book);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("timeout") || error.message.includes("net::")) {
        return Err(new NetworkError(`Network error while scanning book: ${error.message}`, error));
      }
      return Err(new ScrapeError(`Failed to scan book: ${error.message}`, bookmeterUrl as string));
    }
    return Err(new ScrapeError(`Failed to scan book with unknown error: ${String(error)}`, bookmeterUrl as string));
  }
}

/**
 * 欲しい本リストを取得する（ログイン時）
 */
async function fetchWishBooksAsSignedIn(page: Page, userId: string): Promise<Result<BookRepository, AppError>> {
  try {
    const repository = createBookRepository("wish");
    let pageNum = 1;

    for (;;) {
      await page.goto(`${BOOKMETER_BASE_URI}/users/${userId}/books/wish?page=${pageNum}`, {
        waitUntil: ["domcontentloaded"]
      });

      const booksUrlHandle = await $x(page, bookmeterXPath.wish.login.booksUrl);
      const amazonLinkHandle = await $x(page, bookmeterXPath.wish.login.amazonLink);
      const isBookExistHandle = await $x(page, bookmeterXPath.wish.login.isBookExist);

      for (let i = 0; i < booksUrlHandle.length; i++) {
        const bookmeterUrl = String(await getNodeProperty(booksUrlHandle[i], "href")) as BookmeterUrl;
        const amazonUrl = String(await getNodeProperty(amazonLinkHandle[i], "href"));
        const asinString = matchAsin(amazonUrl);

        if (asinString) {
          const book = createNewBook({
            bookmeterUrl,
            isbnOrAsin: asinString as ISBN10 | ASIN
          });
          repository.upsert(book);
        }
      }

      if (isBookExistHandle.length === 0) {
        break;
      }

      pageNum++;
    }

    return Ok(repository);
  } catch (error) {
    if (error instanceof Error) {
      return Err(new ScrapeError(`Failed to fetch wish books: ${error.message}`));
    }
    return Err(new ScrapeError(`Failed to fetch wish books with unknown error: ${String(error)}`));
  }
}

/**
 * 欲しい本リストを取得する（ゲスト時）
 */
async function fetchWishBooksAsGuest(page: Page, userId: string): Promise<Result<BookRepository, AppError>> {
  try {
    const repository = createBookRepository("wish");
    let pageNum = 1;
    let processedCount = 0;
    let waitSeconds = 1.5;

    for (;;) {
      await page.goto(`${BOOKMETER_BASE_URI}/users/${userId}/books/wish?page=${pageNum}`, {
        waitUntil: ["domcontentloaded"]
      });

      const booksUrlHandle = await $x(page, bookmeterXPath.wish.guest.booksUrl);
      if (booksUrlHandle.length === 0) {
        break;
      }
      pageNum++;

      for (const node of booksUrlHandle) {
        const bookmeterUrl = String(await getNodeProperty(node, "href")) as BookmeterUrl;
        const bookResult = await scanBook(page, bookmeterUrl);

        if (bookResult.ok) {
          repository.upsert(bookResult.value);
        } else {
          // エラーをログに記録して続行
          console.warn(`Failed to scan book at ${bookmeterUrl}: ${bookResult.err.message}`);
        }

        processedCount++;
        await sleep(waitSeconds * 1000);

        if (BigInt(processedCount) % 10n === 0n && waitSeconds < 5.5) {
          waitSeconds += 0.2;
        }
      }

      await sleep(40 * 1000);
    }

    return Ok(repository);
  } catch (error) {
    if (error instanceof Error) {
      return Err(new ScrapeError(`Failed to fetch wish books: ${error.message}`));
    }
    return Err(new ScrapeError(`Failed to fetch wish books with unknown error: ${String(error)}`));
  }
}

/**
 * 積読本リストを取得する
 */
async function fetchStackedBooks(page: Page, userId: string): Promise<Result<BookRepository, AppError>> {
  try {
    const repository = createBookRepository("stacked");
    let pageNum = 1;

    for (;;) {
      await page.goto(`${BOOKMETER_BASE_URI}/users/${userId}/books/stacked?page=${pageNum}`, {
        waitUntil: ["domcontentloaded"]
      });

      const booksUrlHandle = await $x(page, bookmeterXPath.stacked.booksUrl);
      if (booksUrlHandle.length === 0) {
        break;
      }
      pageNum++;

      for (const node of booksUrlHandle) {
        const bookmeterUrl = String(await getNodeProperty(node, "href")) as BookmeterUrl;
        const bookResult = await scanBook(page, bookmeterUrl);

        if (bookResult.ok) {
          repository.upsert(bookResult.value);
        } else {
          // エラーをログに記録して続行
          console.warn(`Failed to scan book at ${bookmeterUrl}: ${bookResult.err.message}`);
        }
      }
    }

    return Ok(repository);
  } catch (error) {
    if (error instanceof Error) {
      return Err(new ScrapeError(`Failed to fetch stacked books: ${error.message}`));
    }
    return Err(new ScrapeError(`Failed to fetch stacked books with unknown error: ${String(error)}`));
  }
}

/**
 * スクレイピングを実行する
 * 1つのPageインスタンスをベルトコンベア式に順次使い回す
 */
async function executeScrape(
  browser: Browser,
  userId: string,
  credentials: BookmeterCredentials | undefined,
  mode: BookCollectionMode,
  options: ScrapeOptions
): Promise<Result<BookRepository, AppError>> {
  const { requireLogin } = options;

  // Pageを作成（このインスタンスをすべての処理で使い回す）
  let page = await browser.newPage();

  try {
    // ステップ1: ネットワークインターセプションを設定（Pageの内部状態を変更）
    const interceptionResult = await configureNetworkInterception(page);
    if (!interceptionResult.ok) {
      return Err(interceptionResult.err);
    }

    // ステップ2: ログインが必要な場合、ログイン処理を実行（同じPageにCookieを設定）
    if (requireLogin) {
      if (!credentials) {
        return Err(new ScrapeError("Bookmeter credentials are required to perform an authenticated scrape."));
      }

      const loginResult = await authenticatePage(page, credentials);
      if (!loginResult.ok) {
        return Err(loginResult.err);
      }
      page = loginResult.value;
    }

    // ステップ3: ログイン状態を維持したまま、同じPageでスクレイピング処理を実行
    if (mode === "wish") {
      const result = await (requireLogin
        ? fetchWishBooksAsSignedIn(page, userId)
        : fetchWishBooksAsGuest(page, userId));
      if (isErr(result)) {
        return Err(result.err);
      }
      return result;
    }

    if (mode === "stacked") {
      const result = await fetchStackedBooks(page, userId);
      if (isErr(result)) {
        return Err(result.err);
      }
      return result;
    }

    const exhaustiveCheck: never = mode;
    return Err(new ScrapeError(`Unsupported mode supplied to executeScrape: ${String(exhaustiveCheck)}`));
  } catch (error) {
    if (error instanceof Error) {
      return Err(new ScrapeError(`Unexpected error during scraping: ${error.message}`));
    }
    return Err(new ScrapeError(`Unexpected error during scraping: ${String(error)}`));
  } finally {
    // Pageを必ずクローズ
    await page.close();
  }
}

/**
 * Puppeteer を使用した書籍コレクションスクレイパーを作成する
 */
export function createPuppeteerBookCollectionScraper({
  browser,
  userId,
  credentials
}: Dependencies): BookCollectionScraper {
  return {
    scrape: async (mode: BookCollectionMode, options: ScrapeOptions) => {
      return await executeScrape(browser, userId, credentials, mode, options);
    }
  };
}
