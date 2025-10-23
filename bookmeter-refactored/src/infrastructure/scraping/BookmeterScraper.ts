import type { ScrapingService } from "@/application/services/types";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { Logger } from "@/shared/logging/Logger";
import type { Browser, Page } from "puppeteer";

import { BOOKMETER_XPATH } from "@/domain/constants/BookmeterSelectors";
import { BookCollection } from "@/domain/entities/Book";
import { matchAsin } from "@/domain/services/IsbnService";

export interface BookmeterCredentials {
  account: string;
  password: string;
  baseUri: string;
  defaultUserId: string;
}

export class BookmeterScraper implements ScrapingService {
  constructor(
    private readonly browserFactory: () => Promise<Browser>,
    private readonly credentials: BookmeterCredentials,
    private readonly logger: Logger
  ) {}

  async fetch(mode: BookMode, userId?: string): Promise<BookCollection> {
    const browser = await this.browserFactory();
    try {
      const targetUser = userId ?? this.credentials.defaultUserId;
      if (mode === "wish") {
        return await this.fetchWishBooks(browser, targetUser);
      }
      return await this.fetchStackedBooks(browser, targetUser);
    } finally {
      await browser.close();
    }
  }

  private async fetchWishBooks(browser: Browser, userId: string): Promise<BookCollection> {
    const page = await browser.newPage();
    await this.configurePage(page);
    await this.login(page);

    const collection = new BookCollection();
    let pageNumber = 1;

    while (true) {
      await page.goto(`${this.credentials.baseUri}/users/${userId}/books/wish?page=${pageNumber}`, {
        waitUntil: "domcontentloaded"
      });

      const bookUrls = await this.evaluateXPathAttribute(page, BOOKMETER_XPATH.wish.login.booksUrl, "href");
      const amazonLinks = await this.evaluateXPathAttribute(page, BOOKMETER_XPATH.wish.login.amazonLink, "href");

      if (bookUrls.length === 0) {
        break;
      }

      this.logger.info(`Fetched ${bookUrls.length} wish entries on page ${pageNumber}`);

      for (let i = 0; i < bookUrls.length; i++) {
        const bookmeterUrl = String(bookUrls[i]);
        const amazonUrl = amazonLinks[i] ?? "";
        const isbnOrAsin = matchAsin(amazonUrl) ?? "";
        collection.upsert(this.createBook(bookmeterUrl, isbnOrAsin));
      }

      pageNumber += 1;
    }

    await page.close();
    return collection;
  }

  private async fetchStackedBooks(browser: Browser, userId: string): Promise<BookCollection> {
    const collection = new BookCollection();
    const page = await browser.newPage();
    await this.configurePage(page);
    await this.login(page);

    let pageNumber = 1;

    while (true) {
      await page.goto(`${this.credentials.baseUri}/users/${userId}/books/stacked?page=${pageNumber}`, {
        waitUntil: "domcontentloaded"
      });

      const bookUrls = await this.evaluateXPathAttribute(page, BOOKMETER_XPATH.stacked.booksUrl, "href");
      if (bookUrls.length === 0) {
        break;
      }

      this.logger.info(`Fetched ${bookUrls.length} stacked entries on page ${pageNumber}`);

      for (const url of bookUrls) {
        const details = await this.scanBook(browser, String(url));
        collection.upsert(details);
      }

      pageNumber += 1;
    }

    await page.close();
    return collection;
  }

  private async scanBook(browser: Browser, url: string): Promise<Book> {
    const page = await browser.newPage();
    await this.configurePage(page);

    await page.goto(url, { waitUntil: "domcontentloaded" });

    const amazonLink = await this.evaluateXPathAttribute(page, BOOKMETER_XPATH.book.amazonLink, "href");
    const title = (await this.evaluateXPathText(page, BOOKMETER_XPATH.book.title)) ?? "";
    const author = (await this.evaluateXPathText(page, BOOKMETER_XPATH.book.author)) ?? "";

    await page.close();

    const isbnOrAsin = matchAsin(amazonLink[0] ?? "") ?? "";
    return this.createBook(url, isbnOrAsin, title, author);
  }

  private createBook(url: string, isbnOrAsin: string, title = "", author = ""): Book {
    return {
      bookmeterUrl: url,
      isbnOrAsin,
      title,
      author,
      publisher: "",
      publishedDate: "",
      existInSophia: "No",
      existInUTokyo: "No",
      sophiaOpac: "",
      utokyoOpac: "",
      sophiaMathlibOpac: "",
      description: ""
    };
  }

  private async configurePage(page: Page): Promise<void> {
    await page.setViewport({ width: 1000, height: 1000 });
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      const resourceType = request.resourceType();
      if (resourceType === "image") {
        await request.abort();
      } else {
        await request.continue();
      }
    });
  }

  private async login(page: Page): Promise<void> {
    await page.goto(`${this.credentials.baseUri}/login`, { waitUntil: "domcontentloaded" });

    await page.type("#session_email_address", this.credentials.account, { delay: 50 });
    await page.type("#session_password", this.credentials.password, { delay: 50 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.click('#js_sessions_new_form button[type="submit"]')
    ]);

    this.logger.info("Bookmeter login completed");
  }

  private async evaluateXPathAttribute(page: Page, xpath: string, attribute: string): Promise<string[]> {
    return page.evaluate(
      ({ xp, attr }) => {
        const snapshot = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const results: string[] = [];
        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const node = snapshot.snapshotItem(i) as HTMLElement | null;
          if (node) {
            const value = node.getAttribute(attr);
            if (value) {
              results.push(value);
            }
          }
        }
        return results;
      },
      { xp: xpath, attr: attribute }
    );
  }

  private async evaluateXPathText(page: Page, xpath: string): Promise<string | null> {
    return page.evaluate((xp) => {
      const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const node = result.singleNodeValue as HTMLElement | null;
      return node?.textContent ?? null;
    }, xpath);
  }
}
