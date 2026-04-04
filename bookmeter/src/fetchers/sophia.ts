import fs from "node:fs/promises";

import { extractTextFromPDF } from "../../../.libs/utils";
import { convertISBN10To13, isIsbn10, REGEX_ISBN_GLOBAL } from "../domain/isbn";

import { MATH_LIB_BOOKLIST } from "./cinii";
import { logFetcherError } from "./errors";

import type { HttpClient } from "./httpClient";
import type { FetchResult } from "./types";
import type { Book } from "../domain/book";

/**
 * 数学図書館の所蔵検索
 */
export function searchSophiaMathLib(book: Book, dataSource: Set<string>): FetchResult {
  const bookId = book.isbn_or_asin;

  if (bookId === null || bookId === undefined || !isIsbn10(bookId)) {
    return { book: { ...book }, status: "notOwning" };
  }

  const isbn13 = convertISBN10To13(bookId);

  if (dataSource.has(bookId) || dataSource.has(isbn13)) {
    const mathlib_opac_link = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn13}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;
    return {
      book: {
        ...book,
        exist_in_sophia: "Yes",
        sophia_mathlib_opac: mathlib_opac_link
      },
      status: "owning"
    };
  } else {
    return { book: { ...book }, status: "notOwning" };
  }
}

export async function configMathlibBookList(
  listtype: keyof typeof MATH_LIB_BOOKLIST,
  client: HttpClient
): Promise<Set<string>> {
  const pdfUrl = MATH_LIB_BOOKLIST[listtype];
  const mathlibIsbnList: Set<string> = new Set();

  const filename = `mathlib_${listtype}.txt`;
  const filehandle = await fs.open(filename, "w");

  for (const url of pdfUrl) {
    try {
      const rawPdf = await client.getRaw(url, {
        headers: { "Content-Type": "application/pdf" }
      });

      const parsedPdf = extractTextFromPDF(rawPdf);
      console.log(`Completed fetching the list of ${listtype} books in Sophia Univ. Math Lib`);

      for await (const page of parsedPdf) {
        const matchedIsbn = page.matchAll(REGEX_ISBN_GLOBAL);
        for (const match of matchedIsbn) {
          mathlibIsbnList.add(match[0]);
          await filehandle.appendFile(`${match[0]}\n`);
        }
      }
    } catch (error) {
      logFetcherError(error, "Math Library PDF の取得", `URL: ${url}`, "この PDF はスキップして処理を続行します");
    }
  }

  await filehandle.close();
  console.log(`Completed creating a list of ISBNs of ${listtype} books in Sophia Univ. Math Lib`);
  return mathlibIsbnList;
}
