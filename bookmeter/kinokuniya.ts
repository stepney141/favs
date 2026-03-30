import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { open } from "sqlite";
import { Database } from "sqlite3";

import { CHROME_ARGS } from "../.libs/constants";
import { $x } from "../.libs/pptr-utils";
import { sleep } from "../.libs/utils";

import { DEFAULT_CSV_FILENAME, JOB_NAME } from "./constants";
import { routeIsbn10 } from "./fetchers";
import { checkBookDescriptionExists, updateDescription } from "./sqlite"; // Import checkBookDescriptionExists
import { convertISBN10To13, getPrevBookList, isAsin, isIsbn10 } from "./utils";

import type { BookList, ISBN10 } from "./types";
import type { Page } from "puppeteer";

const stealthPlugin = StealthPlugin();
/* ref:
- https://github.com/berstend/puppeteer-extra/issues/668
- https://github.com/berstend/puppeteer-extra/issues/822
*/
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
        // 空白だけのテキストを無視
        bookDetails += `${text}\n`;
      }
    }
  }
  console.log(`${JOB_NAME}: Extracted description length: ${bookDetails.length} characters`);
  return bookDetails;
}

/**
 * Crawls Kinokuniya website to fetch book descriptions and updates the SQLite database.
 * @param bookListToProcess - Optional BookList to process. If provided, only this list will be processed.
 * @param mode - Optional mode ('wish' or 'stacked') to indicate which table to update.
 */
export async function crawlKinokuniya(bookListToProcess?: BookList, mode?: "wish" | "stacked") {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    args: CHROME_ARGS,
    slowMo: 15
  });
  const page = await browser.newPage();

  console.log(`${JOB_NAME}: Starting to crawl Kinokuniya for book descriptions`);

  // If a specific BookList and mode are provided, only process that list
  if (bookListToProcess && mode) {
    await processBookList(page, mode, bookListToProcess);
  } else {
    // Otherwise, load both wish and stacked lists from CSV and process them
    const wishList = await getPrevBookList(DEFAULT_CSV_FILENAME.wish);
    const stackedList = await getPrevBookList(DEFAULT_CSV_FILENAME.stacked);
    if (wishList === null || stackedList === null) {
      console.log(`${JOB_NAME}: The booklist is not found.`);
      process.exit(1);
    }

    for (const [tableName, bookList] of [["wish", wishList] as const, ["stacked", stackedList] as const]) {
      await processBookList(page, tableName, bookList);
    }
  }

  await browser.close();
  console.log(`${JOB_NAME}: Finished crawling Kinokuniya for book descriptions`);
}

/**
 * Processes a single BookList to fetch and update descriptions.
 * @param page - Puppeteer Page object
 * @param tableName - The SQLite table name ('wish' or 'stacked')
 * @param bookList - The BookList to process
 */
async function processBookList(page: Page, tableName: "wish" | "stacked", bookList: BookList) {
  // First, load existing descriptions from the database to preserve them
  const db = await open({ filename: "./books.sqlite", driver: Database });
  const existingDescriptions = new Map<string, string>();

  try {
    // Get all existing descriptions from the database
    const query = `SELECT isbn_or_asin, description FROM ${tableName} WHERE description IS NOT NULL AND description != ''`;
    const results = await db.all<Array<{ isbn_or_asin: string; description: string }>>(query);

    // Store existing non-empty descriptions in a Map for quick lookup
    for (const row of results) {
      existingDescriptions.set(row.isbn_or_asin, row.description);
    }
    console.log(`${JOB_NAME}: Loaded ${existingDescriptions.size} existing descriptions from database.`);
  } catch (error) {
    console.error(`${JOB_NAME}: Error loading existing descriptions:`, error);
  } finally {
    await db.close();
  }

  // Now process each book
  for (const book of bookList.values()) {
    const id = book.isbn_or_asin;
    // Check if id is a valid ISBN10 and not an ASIN
    if (id && isIsbn10(id) && !isAsin(id)) {
      // If we already have a non-empty description in our Map, preserve it
      if (existingDescriptions.has(id)) {
        const existingDescription = existingDescriptions.get(id);
        // Update the book object with the existing description
        // Use non-null assertion since we've already checked with .has()
        book.description = existingDescription!;
        // console.log(`${JOB_NAME}: Preserved existing description for ISBN ${id}.`);
        continue; // Skip to the next book
      }

      // Check if description needs fetching (book not found or description is NULL)
      const needsFetching = !(await checkBookDescriptionExists(tableName, id));
      console.log(`${JOB_NAME}: ISBN ${id} needs fetching: ${needsFetching}`);

      if (needsFetching) {
        console.log(`${JOB_NAME}: Fetching description for ISBN ${id} from Kinokuniya...`);
        const id13 = convertISBN10To13(id as ISBN10);
        const url =
          routeIsbn10(id as ISBN10) === "Japan"
            ? `https://www.kinokuniya.co.jp/f/dsg-01-${id13}`
            : `https://www.kinokuniya.co.jp/f/dsg-02-${id13}`;

        let descriptionToSave = ""; // Default to empty string if fetch fails or no description found
        try {
          const scrapedDoc = await getBookDetails(page, url);
          descriptionToSave = scrapedDoc.trim(); // Use scraped description, trimmed
          if (descriptionToSave !== "") {
            console.log(`${JOB_NAME}: Successfully fetched description for ISBN ${id}.`);
          } else {
            console.log(`${JOB_NAME}: No description found on Kinokuniya page for ISBN ${id}. Will save empty string.`);
          }
          // Always update the book object with the description (even if empty)
          book.description = descriptionToSave;
        } catch (error) {
          console.error(
            `${JOB_NAME}: Error fetching/processing Kinokuniya page for ISBN ${id} (URL: ${url}). Will save empty string. Error:`,
            error
          );
          // Set empty description for error case
          book.description = "";
        }

        // Update the database with the fetched description (or empty string)
        await updateDescription(tableName, id, descriptionToSave);
        console.log(`${JOB_NAME}: Updated database for ISBN ${id}.`);
      } else {
        // This block runs if checkBookDescriptionExists returned true
        // console.log( // <-- Requirement 1: Commented out this log
        //  `${JOB_NAME}: Description status already known for ISBN ${id} in table ${tableName}. Skipping fetch.`
        // );
      }
    } else if (!id) {
      console.log(`${JOB_NAME}: Skipping book with missing ISBN/ASIN: ${book.book_title}`);
    } else if (!isIsbn10(id) || isAsin(id)) {
      // Optional: Log skipped non-ISBN10s or ASINs if needed for debugging
      // console.log(`${JOB_NAME}: Skipping non-ISBN10 or ASIN ID: ${id}`);
    }
  }
}
