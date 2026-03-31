/**
 * 紀伊國屋書店サイトから書籍の内容紹介をスクレイピングする。
 * DB 操作は BookRepository を通じて行う（DI）。
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../../../.libs/constants";
import { $x } from "../../../.libs/pptr-utils";
import { sleep } from "../../../.libs/utils";
import { DEFAULT_CSV_FILENAME, JOB_NAME } from "../constants";
import { convertISBN10To13, isAsin, isIsbn10, routeIsbn10 } from "../domain/isbn";
import { getPrevBookList } from "../utils";

import type { BookRepository } from "../db/bookRepository";
import type { BookList } from "../domain/book";
import type { Page } from "puppeteer";

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("navigator.plugins");
stealthPlugin.enabledEvasions.delete("media.codecs");
puppeteer.use(stealthPlugin);

const KINOKUNIYA_XPATH = {
  出版社内容情報: '//div[@class="career_box"]/h3[text()="出版社内容情報"]/following-sibling::p[1]',
  内容説明: '//div[@class="career_box"]/h3[text()="内容説明"]/following-sibling::p[1]',
  目次: '//div[@class="career_box"]/h3[text()="目次"]/following-sibling::p[1]'
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
  return bookDetails;
}

/**
 * 紀伊國屋書店サイトをクロールして書籍の内容紹介を取得し、DB を更新する。
 */
export async function crawlKinokuniya(
  bookListToProcess: BookList | undefined,
  mode: "wish" | "stacked" | undefined,
  repo: Pick<BookRepository, "checkDescriptionExists" | "updateDescription" | "load">
): Promise<void> {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    args: CHROME_ARGS,
    slowMo: 15
  });
  const page = await browser.newPage();

  console.log(`${JOB_NAME}: Starting to crawl Kinokuniya for book descriptions`);

  if (bookListToProcess && mode) {
    await processBookList(page, mode, bookListToProcess, repo);
  } else {
    const wishList = await getPrevBookList(DEFAULT_CSV_FILENAME.wish, repo as BookRepository);
    const stackedList = await getPrevBookList(DEFAULT_CSV_FILENAME.stacked, repo as BookRepository);
    if (wishList === null || stackedList === null) {
      console.log(`${JOB_NAME}: The booklist is not found.`);
      process.exit(1);
    }

    for (const [tableName, bookList] of [["wish", wishList] as const, ["stacked", stackedList] as const]) {
      await processBookList(page, tableName, bookList, repo);
    }
  }

  await browser.close();
  console.log(`${JOB_NAME}: Finished crawling Kinokuniya for book descriptions`);
}

async function processBookList(
  page: Page,
  tableName: "wish" | "stacked",
  bookList: BookList,
  repo: Pick<BookRepository, "checkDescriptionExists" | "updateDescription" | "load">
): Promise<void> {
  // 既存の description をロードして保持する
  const existingBookList = repo.load(tableName);
  const existingDescriptions = new Map<string, string>();
  for (const book of existingBookList.values()) {
    if (book.description && book.description.trim().length > 0) {
      existingDescriptions.set(book.isbn_or_asin, book.description);
    }
  }
  console.log(`${JOB_NAME}: Loaded ${existingDescriptions.size} existing descriptions from database.`);

  for (const book of bookList.values()) {
    const id = book.isbn_or_asin;
    if (id && isIsbn10(id) && !isAsin(id)) {
      if (existingDescriptions.has(id)) {
        book.description = existingDescriptions.get(id)!;
        continue;
      }

      const needsFetching = !repo.checkDescriptionExists(tableName, id);
      console.log(`${JOB_NAME}: ISBN ${id} needs fetching: ${needsFetching}`);

      if (needsFetching) {
        console.log(`${JOB_NAME}: Fetching description for ISBN ${id} from Kinokuniya...`);
        const id13 = convertISBN10To13(id);
        const url =
          routeIsbn10(id) === "Japan"
            ? `https://www.kinokuniya.co.jp/f/dsg-01-${id13}`
            : `https://www.kinokuniya.co.jp/f/dsg-02-${id13}`;

        let descriptionToSave = "";
        try {
          const scrapedDoc = await getBookDetails(page, url);
          descriptionToSave = scrapedDoc.trim();
          if (descriptionToSave !== "") {
            console.log(`${JOB_NAME}: Successfully fetched description for ISBN ${id}.`);
          } else {
            console.log(`${JOB_NAME}: No description found on Kinokuniya page for ISBN ${id}. Will save empty string.`);
          }
          book.description = descriptionToSave;
        } catch (error) {
          console.error(
            `${JOB_NAME}: Error fetching/processing Kinokuniya page for ISBN ${id} (URL: ${url}). Will save empty string. Error:`,
            error
          );
          book.description = "";
        }

        repo.updateDescription(tableName, id, descriptionToSave);
        console.log(`${JOB_NAME}: Updated database for ISBN ${id}.`);
      }
    } else if (!id) {
      console.log(`${JOB_NAME}: Skipping book with missing ISBN/ASIN: ${book.book_title}`);
    }
  }
}
