/**
 * ISBNdb API からの書誌情報取得。
 * ISBNdb のレスポンス型はこのファイル内に閉じる。
 */

import { mapResult, mapResultErr } from "../../../.libs/lib";

import { httpToFetcherError } from "./errors";

import type { HttpClient } from "./httpClient";
import type { BiblioinfoErrorStatus, FetcherResult } from "./types";
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

export async function fetchISBNdb(book: Book, credential: string, client: HttpClient): Promise<FetcherResult> {
  const isbn = book["isbn_or_asin"];

  const httpResult = await client.getWithStatusSafe<IsbnDbSingleResponse>(`${ISBNDB_API_URI}/book/${isbn}`, "ISBNdb", {
    headers: {
      "Content-Type": "application/json",
      Authorization: credential
    },
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404
  });

  return mapResult(mapResultErr(httpResult, httpToFetcherError), ({ data: rawResponse, status }) => {
    if ("errorMessage" in rawResponse || status === 404) {
      const statusText: BiblioinfoErrorStatus = "Not_found_in_ISBNdb";
      const part = {
        book_title: statusText,
        author: statusText,
        publisher: statusText,
        published_date: statusText
      };
      return { book: { ...book, ...part }, status: "notFound" as const };
    }

    const bookinfo = rawResponse.book;
    const part = {
      book_title: bookinfo["title"] ?? "",
      author: bookinfo["authors"]?.toString() ?? "",
      publisher: bookinfo["publisher"] ?? "",
      published_date: bookinfo["date_published"] ?? ""
    };
    return { book: { ...book, ...part }, status: "found" as const };
  });
}
