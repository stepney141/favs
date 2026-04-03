/**
 * 国立国会図書館（NDL）書誌検索 API。
 * NDL のレスポンス型はこのファイル内に閉じる。
 * ISBN 検索で見つからない場合はタイトル+著者で再帰的にリトライする。
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */

import { XMLParser } from "fast-xml-parser";

import { Ok, mapResultErr } from "../../../.libs/lib";
import { isIsbn10 } from "../domain/isbn";

import { httpToFetcherError } from "./errors";

import type { HttpClient } from "./httpClient";
import type { BiblioinfoErrorStatus, FetcherResult } from "./types";
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

export async function fetchNDL(book: Book, client: HttpClient, useIsbn: boolean = true): Promise<FetcherResult> {
  const isbn = book["isbn_or_asin"];
  const title = encodeURIComponent(book["book_title"]);
  const author = encodeURIComponent(book["author"]);

  const query = isIsbn10(isbn) ? `isbn=${isbn}` : `any=${title} ${author}`;

  const httpResult = await client.getSafe<string>(`https://ndlsearch.ndl.go.jp/api/opensearch?${query}`, "NDL", {
    responseType: "text"
  });

  const fetcherResult = mapResultErr(httpResult, httpToFetcherError);
  if (!fetcherResult.ok) {
    return fetcherResult;
  }

  const parsedResult = fxp.parse(fetcherResult.value) as NdlResponseJson;
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
    return Ok({ book: { ...book, ...part }, status: "found" as const });
  } else {
    // ISBN 検索で見つからなかった場合、タイトル+著者で再帰的にリトライ
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
    return Ok({ book: { ...book, ...part }, status: "notFound" as const });
  }
}
