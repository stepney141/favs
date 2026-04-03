/**
 * 紀伊國屋書店サイトから書籍説明文を取得するスクレイピング層。
 * DB 判定やブラウザのライフサイクルは呼び出し側に委譲する。
 */

import { $x } from "../../../.libs/pptr-utils";
import { sleep } from "../../../.libs/utils";
import { JOB_NAME } from "../constants";
import { isAsin, isIsbn10, routeIsbn10, convertISBN10To13 } from "../domain/isbn";

import type { Result } from "../../../.libs/lib";
import type { DbError } from "../db/errors";
import type { BookList } from "../domain/book";
import type { ISBN10 } from "../domain/isbn";
import type { Page } from "puppeteer";

const KINOKUNIYA_XPATH = {
  出版社内容情報: '//div[@class="career_box"]/h3[text()="出版社内容情報"]/following-sibling::p[1]',
  内容説明: '//div[@class="career_box"]/h3[text()="内容説明"]/following-sibling::p[1]',
  目次: '//div[@class="career_box"]/h3[text()="目次"]/following-sibling::p[1]'
};

async function extractBookDetails(page: Page, url: string): Promise<string> {
  await page.goto(url, { waitUntil: "networkidle2" });
  await sleep(1000);

  let bookDetails = "";
  for (const xpath of Object.values(KINOKUNIYA_XPATH)) {
    const [element] = await $x(page, xpath);
    if (element === undefined) {
      continue;
    }

    const text = await page.evaluate((node) => node.textContent, element);
    if (text === null || text.trim() === "") {
      continue;
    }

    bookDetails += `${text}\n`;
  }

  console.log(`${JOB_NAME}: Extracted description length: ${bookDetails.length} characters`);
  return bookDetails;
}

export function canFetchKinokuniyaDescription(identifier: string): identifier is ISBN10 {
  return identifier !== "" && isIsbn10(identifier) && !isAsin(identifier);
}

export function buildKinokuniyaBookUrl(isbn: ISBN10): string {
  const isbn13 = convertISBN10To13(isbn);
  return routeIsbn10(isbn) === "Japan"
    ? `https://www.kinokuniya.co.jp/f/dsg-01-${isbn13}`
    : `https://www.kinokuniya.co.jp/f/dsg-02-${isbn13}`;
}

export async function fetchKinokuniyaDescription(page: Page, isbn: ISBN10): Promise<string> {
  const url = buildKinokuniyaBookUrl(isbn);

  try {
    const description = (await extractBookDetails(page, url)).trim();

    if (description === "") {
      console.log(`${JOB_NAME}: No description found on Kinokuniya page for ISBN ${isbn}.`);
      return "";
    }

    console.log(`${JOB_NAME}: Successfully fetched description for ISBN ${isbn}.`);
    return description;
  } catch (error) {
    console.error(`${JOB_NAME}: Error fetching Kinokuniya page for ISBN ${isbn} (URL: ${url}).`, error);
    return "";
  }
}

export function buildExistingDescriptionMap(
  tableName: "wish" | "stacked",
  loadResult: Result<BookList, DbError>
): Map<string, string> {
  if (!loadResult.ok) {
    console.error(`${JOB_NAME}: Failed to load existing descriptions from ${tableName}:`, loadResult.err);
    return new Map();
  }

  const existingDescriptions = new Map<string, string>();
  for (const book of loadResult.value.values()) {
    if (book.description.trim() === "") {
      continue;
    }

    existingDescriptions.set(book.isbn_or_asin, book.description);
  }

  return existingDescriptions;
}
