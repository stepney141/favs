import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { open } from "sqlite";
import { Database } from "sqlite3";

import { CHROME_ARGS } from "../../../.libs/constants";
import { $x } from "../../../.libs/pptr-utils";
import { sleep } from "../../../.libs/utils";
import { convertISBN10To13, isAsin, isIsbn10 } from "../../domain/book-id";
import { JOB_NAME } from "../domain/constants";

import { routeIsbn10 } from "./httpBibliographyEnricher";
import { checkBookDescriptionExists, updateDescription } from "./sqliteGateway";

import type { DescriptionEnricher, BookListMode } from "../application/ports";
import type { BookList, ISBN10 } from "../domain/types";
import type { Browser, Page } from "puppeteer";

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("navigator.plugins");
stealthPlugin.enabledEvasions.delete("media.codecs");
puppeteer.use(stealthPlugin);

type KinokuniyaEnricherDependencies = {
  browserFactory?: () => Promise<Browser>;
};

const defaultBrowserFactory = async () => {
  return await puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    args: CHROME_ARGS,
    slowMo: 15
  });
};

async function getBookDetails(page: Page, url: string): Promise<string> {
  await page.goto(url, { waitUntil: "networkidle2" });
  await sleep(1000);
  let bookDetails = "";
  for (const xpath of Object.values(KINOKUNIYA_XPATH)) {
    const [element] = await $x(page, xpath);
    if (element) {
      const text = await page.evaluate((el) => el.textContent, element);
      if (text && text.trim()) {
        bookDetails += `${text}\n`;
      }
    }
  }
  console.log(`${JOB_NAME}: Extracted description length: ${bookDetails.length} characters`);
  return bookDetails.trim();
}

async function loadExistingDescriptions(tableName: string): Promise<Map<string, string>> {
  const db = await open({ filename: "./books.sqlite", driver: Database });
  try {
    const query = `SELECT isbn_or_asin, description FROM ${tableName} WHERE description IS NOT NULL AND description != ''`;
    const rows = await db.all<Array<{ isbn_or_asin: string; description: string }>>(query);
    return new Map(rows.map((row) => [row.isbn_or_asin, row.description]));
  } catch (error) {
    console.error(`${JOB_NAME}: Error loading existing descriptions:`, error);
    return new Map();
  } finally {
    await db.close();
  }
}

function cloneBookList(source: BookList): BookList {
  return new Map(
    Array.from(source.entries()).map(([key, book]) => [
      key,
      {
        ...book
      }
    ])
  );
}

async function enrichBookListWithDescriptions(
  tableName: BookListMode,
  bookList: BookList,
  browser: Browser
): Promise<BookList> {
  const workingList = cloneBookList(bookList);
  const existingDescriptions = await loadExistingDescriptions(tableName);
  const page = await browser.newPage();

  try {
    for (const book of workingList.values()) {
      const id = book.isbn_or_asin;
      if (!id) {
        console.log(`${JOB_NAME}: Skipping book with missing ISBN/ASIN: ${book.book_title}`);
        continue;
      }
      if (!isIsbn10(id) || isAsin(id)) {
        continue;
      }

      if (existingDescriptions.has(id)) {
        book.description = existingDescriptions.get(id)!;
        continue;
      }

      const needsFetching = !(await checkBookDescriptionExists(tableName, id));
      if (!needsFetching) {
        continue;
      }

      const isbn13 = convertISBN10To13(id as ISBN10);
      const url =
        routeIsbn10(id as ISBN10) === "Japan"
          ? `https://www.kinokuniya.co.jp/f/dsg-01-${isbn13}`
          : `https://www.kinokuniya.co.jp/f/dsg-02-${isbn13}`;

      let description = "";
      try {
        description = await getBookDetails(page, url);
        book.description = description;
      } catch (error) {
        console.error(
          `${JOB_NAME}: Error fetching/processing Kinokuniya page for ISBN ${id} (URL: ${url}). Will save empty string. Error:`,
          error
        );
        book.description = "";
      }

      await updateDescription(tableName, id, description);
      console.log(`${JOB_NAME}: Updated database for ISBN ${id}.`);
    }
  } finally {
    await page.close();
  }

  return workingList;
}

export function createKinokuniyaDescriptionEnricher(
  dependencies: KinokuniyaEnricherDependencies = {}
): DescriptionEnricher {
  const browserFactory = dependencies.browserFactory ?? defaultBrowserFactory;

  return {
    enrich: async (mode: BookListMode, list: BookList) => {
      if (list.size === 0) {
        return list;
      }

      const browser = await browserFactory();
      try {
        return await enrichBookListWithDescriptions(mode, list, browser);
      } finally {
        await browser.close();
        console.log(`${JOB_NAME}: Finished crawling Kinokuniya for book descriptions`);
      }
    }
  };
}
