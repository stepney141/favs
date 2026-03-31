/**
 * ISBNdb API からの書誌情報取得。
 * ISBNdb のレスポンス型はこのファイル内に閉じる。
 */

import { JOB_NAME } from "../constants";

import type { HttpClient } from "./httpClient";
import type { BookSearchState, BiblioinfoErrorStatus } from "./types";
import type { Book } from "../domain/book";

type IsbnDbBook = {
  title: string;
  title_long: string;
  isbn: string;
  isbn13: string;
  publisher: string;
  date_published: string;
  authors: string[];
  [key: string]: unknown;
};

type IsbnDbSingleResponse = { book: IsbnDbBook } | { errorMessage: "Not Found"; [key: string]: unknown };

const ISBNDB_API_URI = "https://api2.isbndb.com";

export async function fetchISBNdb(book: Book, credential: string, client: HttpClient): Promise<BookSearchState> {
  const isbn = book["isbn_or_asin"];

  try {
    const { data: rawResponse, status } = await client.getWithStatus<IsbnDbSingleResponse>(
      `${ISBNDB_API_URI}/book/${isbn}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: credential
        },
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404
      }
    );

    if ("errorMessage" in rawResponse || status === 404) {
      const statusText: BiblioinfoErrorStatus = "Not_found_in_ISBNdb";
      const part = {
        book_title: statusText,
        author: statusText,
        publisher: statusText,
        published_date: statusText
      };
      return { book: { ...book, ...part }, isFound: false };
    }

    const bookinfo = rawResponse.book;
    const part = {
      book_title: bookinfo["title"] ?? "",
      author: bookinfo["authors"]?.toString() ?? "",
      publisher: bookinfo["publisher"] ?? "",
      published_date: bookinfo["date_published"] ?? ""
    };
    return { book: { ...book, ...part }, isFound: true };
  } catch (error) {
    logFetcherError(error, "ISBNdb", `ISBN: ${isbn}`);
    const statusText: BiblioinfoErrorStatus = "ISBNdb_API_Error";
    const part = {
      book_title: statusText,
      author: statusText,
      publisher: statusText,
      published_date: statusText
    };
    return { book: { ...book, ...part }, isFound: false };
  }
}

function logFetcherError(error: unknown, apiName: string, context?: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`${JOB_NAME}: ${apiName} APIエラー` + (context ? ` (${context})` : "") + `: ${errorMessage}`);
}
