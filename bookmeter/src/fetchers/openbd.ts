/**
 * OpenBD API からの書誌情報取得。
 * OpenBD のレスポンス型はこのファイル内に閉じる。
 */

import { mapResult, mapResultErr } from "../../../.libs/lib";
import { zip } from "../../../.libs/utils";

import { httpToFetcherError } from "./errors";

import type { FetcherError } from "./errors";
import type { HttpClient } from "./httpClient";
import type { BiblioinfoErrorStatus, FetchResult } from "./types";
import type { Result } from "../../../.libs/lib";
import type { BookList } from "../domain/book";

type OpenBDSummary = {
  isbn: string;
  title: string;
  volume: string;
  series: string;
  publisher: string;
  pubdate: string;
  cover: string;
  author: string;
};

type OpenBDCollateralDetail = {
  TextContent?: {
    TextType: string;
    ContentAudience: string;
    Text: string;
  }[];
};

type OpenBDResponse = ({
  summary: OpenBDSummary;
  onix: {
    CollateralDetail: OpenBDCollateralDetail;
  };
} | null)[];

export async function bulkFetchOpenBD(
  bookList: BookList,
  client: HttpClient
): Promise<Result<FetchResult[], FetcherError>> {
  const bulkTargetIsbns = [...bookList.values()].map((b) => b["isbn_or_asin"]).toString();
  const bookmeterKeys = Array.from(bookList.keys());

  const httpResult = await client.getSafe<OpenBDResponse>(
    `https://api.openbd.jp/v1/get?isbn=${bulkTargetIsbns}`,
    "OpenBD"
  );

  return mapResult(mapResultErr(httpResult, httpToFetcherError), (responseData) => {
    const results: FetchResult[] = [];

    for (const [bookmeterURL, bookResp] of zip(bookmeterKeys, responseData)) {
      if (bookResp === null) {
        const statusText: BiblioinfoErrorStatus = "Not_found_in_OpenBD";
        const part = {
          book_title: statusText,
          author: statusText,
          publisher: statusText,
          published_date: statusText
        };
        results.push({
          book: { ...bookList.get(bookmeterURL)!, ...part },
          status: "notFound"
        });
      } else {
        const bookinfo = bookResp.summary;

        const title = bookinfo.title === "" ? "" : `${bookinfo.title}`;
        const volume = bookinfo.volume === "" ? "" : ` ${bookinfo.volume}`;
        const series = bookinfo.series === "" ? "" : ` (${bookinfo.series})`;

        const part = {
          book_title: `${title}${volume}${series}`,
          author: bookinfo.author ?? "",
          publisher: bookinfo.publisher ?? "",
          published_date: bookinfo.pubdate ?? "",
          description: ""
        };
        results.push({
          book: { ...bookList.get(bookmeterURL)!, ...part },
          status: "found"
        });
      }
    }
    return results;
  });
}
