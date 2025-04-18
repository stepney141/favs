import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { $x } from "../.libs/pptr-utils";
import { sleep } from "../.libs/utils";

import { DEFAULT_CSV_FILENAME, JOB_NAME } from "./constants";
import { routeIsbn10 } from "./fetchers";
import { checkBookDescriptionExists, updateDescription } from "./sqlite"; // Import checkBookDescriptionExists
import { convertISBN10To13, getPrevBookList, isAsin, isIsbn10 } from "./utils";

import type { ISBN10 } from "./types";
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
  await page.goto(url, { waitUntil: "domcontentloaded" });
  let bookDetails = "";
  for (const xpath of Object.values(KINOKUNIYA_XPATH)) {
    const [element] = await $x(page, xpath);
    if (element) {
      const text = await page.evaluate((el) => el.textContent, element);
      bookDetails += `${text}\n`;
    }
  }
  return bookDetails;
}

export async function crawlKinokuniya() {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    slowMo: 15
  });
  const page = await browser.newPage();

  const wishList = await getPrevBookList(DEFAULT_CSV_FILENAME.wish);
  const stackedList = await getPrevBookList(DEFAULT_CSV_FILENAME.stacked);
  if (wishList === null || stackedList === null) {
    console.log(`${JOB_NAME}: The booklist is not found.`);
    process.exit(1);
  }

  console.log(`${JOB_NAME}: Starting to crawl Kinokuniya for book descriptions`);

  for (const [tableName, bookList] of [["wish", wishList] as const, ["stacked", stackedList] as const]) {
    for (const book of bookList.values()) {
      const id = book.isbn_or_asin;
      // Check if id is a valid ISBN10 and not an ASIN
      if (id && isIsbn10(id) && !isAsin(id)) {
        // Check if description needs fetching (book not found or description is NULL)
        const needsFetching = !(await checkBookDescriptionExists(tableName, id));

        if (needsFetching) {
          console.log(`${JOB_NAME}: Fetching description for ISBN ${id} from Kinokuniya...`);
          const id13 = convertISBN10To13(id as ISBN10);
          const url =
            routeIsbn10(id as ISBN10) === "Japan"
              ? `https://www.kinokuniya.co.jp/f/dsg-01-${id13}`
              : `https://www.kinokuniya.co.jp/f/dsg-02-${id13}`;

          let descriptionToSave = ""; // Default to empty string if fetch fails or no description found
          try {
            const res = await fetch(url);
            if (res.ok) {
              const scrapedDoc = await getBookDetails(page, url);
              descriptionToSave = scrapedDoc.trim(); // Use scraped description, trimmed
              if (descriptionToSave !== "") {
                console.log(`${JOB_NAME}: Successfully fetched description for ISBN ${id}.`);
              } else {
                console.log(
                  `${JOB_NAME}: No description found on Kinokuniya page for ISBN ${id}. Will save empty string.`
                );
              }
            } else {
              console.log(
                `${JOB_NAME}: Kinokuniya page not found or error for ISBN ${id} (URL: ${url}, Status: ${res.status}). Will save empty string.`
              );
            }
          } catch (error) {
            console.error(
              `${JOB_NAME}: Error fetching/processing Kinokuniya page for ISBN ${id} (URL: ${url}). Will save empty string. Error:`,
              error
            );
          }

          // Update the database with the fetched description (or empty string)
          // This ensures checkBookDescriptionExists returns true next time for this ISBN
          await updateDescription(tableName, id, descriptionToSave);
          console.log(`${JOB_NAME}: Updated database for ISBN ${id}.`);

          await sleep(1000); // Wait after attempting a fetch
        } else {
          // This block runs if checkBookDescriptionExists returned true
          console.log(
            `${JOB_NAME}: Description status already known for ISBN ${id} in table ${tableName}. Skipping fetch.`
          );
        }
      } else if (!id) {
        console.log(`${JOB_NAME}: Skipping book with missing ISBN/ASIN: ${book.book_title}`);
      } else if (!isIsbn10(id) || isAsin(id)) {
        // Optional: Log skipped non-ISBN10s or ASINs if needed for debugging
        // console.log(`${JOB_NAME}: Skipping non-ISBN10 or ASIN ID: ${id}`);
      }
    }
  }

  await browser.close();
  console.log(`${JOB_NAME}: Finished crawling Kinokuniya for book descriptions`);
}
