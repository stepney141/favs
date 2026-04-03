/**
 * Google Books API からの書誌情報取得。
 * Google Books のレスポンス型はこのファイル内に閉じる。
 * @link https://developers.google.com/books/docs/v1/reference/volumes/list?hl=en
 */

import { Err, mapResult, mapResultErr } from "../../../.libs/lib";

import { FetcherError, httpToFetcherError } from "./errors";

import type { HttpClient } from "./httpClient";
import type { BiblioinfoErrorStatus, FetcherResult } from "./types";
import type { Book } from "../domain/book";

type GoogleBookItem = {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: "ISBN_10" | "ISBN_13"; identifier: string }[];
    pageCount?: number;
    printType?: string;
    language?: string;
    infoLink?: string;
  };
};

type GoogleBookApiResponse = {
  kind: string;
  items?: GoogleBookItem[];
  totalItems: number;
};

export async function fetchGoogleBooks(book: Book, credential: string, client: HttpClient): Promise<FetcherResult> {
  const isbn = book["isbn_or_asin"];

  if (isbn === null || isbn === undefined) {
    return Err(new FetcherError({ type: "invalidIsbn" }));
  }

  const httpResult = await client.getSafe<GoogleBookApiResponse>(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${credential}`,
    "GoogleBooks"
  );

  return mapResult(mapResultErr(httpResult, httpToFetcherError), (json) => {
    if (json.totalItems !== 0 && json.items !== undefined) {
      const bookinfo = json.items[0].volumeInfo;
      const subtitle = bookinfo.subtitle ?? "";
      const part = {
        book_title: `${bookinfo.title}${subtitle === "" ? subtitle : " " + subtitle}`,
        author: bookinfo.authors?.toString() ?? "",
        publisher: bookinfo.publisher ?? "",
        published_date: bookinfo.publishedDate ?? ""
      };
      return { book: { ...book, ...part }, status: "found" as const };
    } else {
      const statusText: BiblioinfoErrorStatus = "Not_found_in_GoogleBooks";
      const part = {
        book_title: statusText,
        author: statusText,
        publisher: statusText,
        published_date: statusText
      };
      return { book: { ...book, ...part }, status: "notFound" as const };
    }
  });
}
