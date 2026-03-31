/**
 * 国立国会図書館（NDL）書誌検索 API。
 * NDL のレスポンス型はこのファイル内に閉じる。
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */

import { XMLParser } from "fast-xml-parser";

import { JOB_NAME } from "../constants";
import { isIsbn10 } from "../domain/isbn";

import type { HttpClient } from "./httpClient";
import type { BookSearchState, BiblioinfoErrorStatus } from "./types";
import type { Book } from "../domain/book";

type NdlResponseJson = {
  rss: {
    channel: {
      item:
        | {
            title: string;
            "dcndl:seriesTitle"?: string;
            "dcndl:volume"?: string;
            author: string;
            "dc:publisher": string;
            pubDate: string;
          }
        | {
            title: string;
            "dcndl:seriesTitle"?: string;
            "dcndl:volume"?: string;
            author: string;
            "dc:publisher": string;
            pubDate: string;
          }[];
    };
  };
};

const fxp = new XMLParser();

export async function fetchNDL(book: Book, client: HttpClient, useIsbn: boolean = true): Promise<BookSearchState> {
  const isbn = book["isbn_or_asin"];
  const title = encodeURIComponent(book["book_title"]);
  const author = encodeURIComponent(book["author"]);

  const query = isIsbn10(isbn) ? `isbn=${isbn}` : `any=${title} ${author}`;

  try {
    const responseText = await client.get<string>(`https://ndlsearch.ndl.go.jp/api/opensearch?${query}`, {
      responseType: "text"
    });
    const parsedResult = fxp.parse(responseText) as NdlResponseJson;
    const ndlResp = parsedResult.rss.channel;

    if ("item" in ndlResp) {
      const bookinfo = Array.isArray(ndlResp.item) ? ndlResp.item[0] : ndlResp.item;

      const ndlTitle = bookinfo["title"] ?? "";
      const volume = bookinfo["dcndl:volume"] ?? "";
      const series = bookinfo["dcndl:seriesTitle"] ?? "";

      const part = {
        book_title: `${ndlTitle}${volume === "" ? volume : " " + volume}${series === "" ? series : " / " + series}`,
        author: bookinfo["author"] ?? "",
        publisher: bookinfo["dc:publisher"] ?? "",
        published_date: bookinfo["pubDate"] ?? ""
      };
      return { book: { ...book, ...part }, isFound: true };
    } else {
      if (useIsbn) {
        return await fetchNDL(book, client, false);
      }

      const statusText: BiblioinfoErrorStatus = "Not_found_in_NDL";
      const part = {
        book_title: statusText,
        author: statusText,
        publisher: statusText,
        published_date: statusText
      };
      return { book: { ...book, ...part }, isFound: false };
    }
  } catch (error) {
    logFetcherError(error, "NDL", `Query: ${query}`);
    const statusText: BiblioinfoErrorStatus = "NDL_API_Error";
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
