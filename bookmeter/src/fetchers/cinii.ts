/**
 * CiNii Books 所蔵検索 API および数学図書館所蔵検索。
 * CiNii のレスポンス型はこのファイル内に閉じる。
 * @link https://support.nii.ac.jp/ja/cib/api/b_opensearch
 */

import { Ok, mapResultErr } from "../../../.libs/lib";
import { sleep } from "../../../.libs/utils";
import { CINII_TARGET_TAGS } from "../domain/book";
import { isAsin } from "../domain/isbn";

import { httpToFetcherError, logFetcherError, logFetcherResultError } from "./errors";
import { normalizeExternalText } from "./normalizeText";
import { searchSophiaMathLib } from "./sophia";

import type { HttpClient } from "./httpClient";
import type { ExternalTextValue } from "./normalizeText";
import type { FetchResult, FetcherResult } from "./types";
import type { Book, CiniiTargetOrgs } from "../domain/book";

export type CiniiTarget = {
  tag: CiniiTargetOrgs;
  cinii_kid: string;
  opac: string;
};

/**
 * 検索対象となる図書館の情報
 */
export const CINII_TARGETS: CiniiTarget[] = [
  {
    tag: "utokyo",
    cinii_kid: "KI000221",
    opac: "https://opac.dl.itc.u-tokyo.ac.jp"
  },
  {
    tag: "sophia",
    cinii_kid: "KI00209X", //ref: https://ci.nii.ac.jp/library/FA005358
    opac: "https://www.lib.sophia.ac.jp"
  }
];

// 数学図書館の図書リスト ref: https://mathlib-sophia.opac.jp/opac/Notice/detail/108
export const MATH_LIB_BOOKLIST = {
  ja: [
    "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_j.pdf",
    "https://mathlib-sophia.opac.jp/opac/file/view/202404-202503.pdf"
  ],
  en_with_isbn: "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_F_1.pdf"
};

const REGEX_NCID_IN_CINII_URL = /(?<=https:\/\/ci.nii.ac.jp\/ncid\/).*/;
const OPAC_REDIRECT_TIMEOUT_MS = 10_000;
const OPAC_REDIRECT_MAX_ATTEMPTS = 2;

/**
 * OPAC のリダイレクト URL を取得する（CiNii 内部のフォールバック）。
 */
async function getRedirectedUrl(targetUrl: string): Promise<string | undefined> {
  for (let attempt = 1; attempt <= OPAC_REDIRECT_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(targetUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(OPAC_REDIRECT_TIMEOUT_MS)
      });
      return response.url;
    } catch (error) {
      if (attempt === OPAC_REDIRECT_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(1000 * attempt);
    }
  }
  return undefined;
}

type CiNiiItem = {
  "@type": string;
  "@id": string;
  "dc:creator": string;
  "dc:title": string;
  "dc:publisher": ExternalTextValue;
  "dc:pubDate": string;
  "dc:isbn": string;
};

type CiniiResponse = {
  "@graph":
    | {
        "@type": string;
        "@id": string;
        "opensearch:totalResults": "0";
        "opensearch:startIndex": "0";
        "opensearch:itemsPerPage": "0";
      }[]
    | {
        "@type": string;
        "@id": string;
        items: CiNiiItem[];
      }[];
  "@context": {
    dc: string;
    rdf: string;
    opensearch: string;
    rdfs: string;
    dcterms: string;
    prism: string;
    cinii: string;
    "@vocab": string;
  };
};

export async function isBookAvailableInCinii(
  fetchResult: FetchResult,
  libraryInfo: CiniiTarget,
  credential: string,
  client: HttpClient
): Promise<FetcherResult> {
  const isbn = fetchResult.book["isbn_or_asin"];
  const title = encodeURIComponent(fetchResult.book["book_title"]);
  const author = encodeURIComponent(fetchResult.book["author"]);

  if (libraryInfo === undefined) {
    return Ok({ book: fetchResult.book, status: "notOwning" as const });
  }

  const query = isbn === null || isAsin(isbn) ? `title=${title}&author=${author}` : `isbn=${isbn}`;
  const url = `https://ci.nii.ac.jp/books/opensearch/search?${query}&kid=${libraryInfo.cinii_kid}&format=json&appid=${credential}`;

  const httpResult = await client.getSafe<CiniiResponse>(url, "CiNii");
  const ciniiResult = mapResultErr(httpResult, httpToFetcherError);

  if (!ciniiResult.ok) {
    logFetcherResultError(ciniiResult.err, `Library: ${libraryInfo.tag}, Query: ${query}`);
    return Ok({
      book: { ...fetchResult.book, [`exist_in_${libraryInfo.tag}`]: "Error" },
      status: "notOwning" as const
    });
  }

  const responseData = ciniiResult.value;
  const graph = responseData["@graph"][0];

  if ("items" in graph) {
    const ncidUrl = graph.items[0]["@id"];
    const ncid = ncidUrl.match(REGEX_NCID_IN_CINII_URL)?.[0];

    const infoToUpdate = {
      book_title: graph.items[0]["dc:title"],
      author: graph.items[0]["dc:creator"],
      publisher: normalizeExternalText(graph.items[0]["dc:publisher"]),
      published_date: graph.items[0]["dc:pubDate"]
    };
    const owingStatus = {
      [`exist_in_${libraryInfo.tag}`]: "Yes",
      [`${libraryInfo.tag.toLowerCase()}_opac`]: `${libraryInfo.opac}/opac/opac_openurl?ncid=${ncid}`
    };

    if (fetchResult.status === "found") {
      return Ok({ book: { ...fetchResult.book, ...owingStatus }, status: "owning" as const });
    } else {
      return Ok({ book: { ...fetchResult.book, ...infoToUpdate, ...owingStatus }, status: "owning" as const });
    }
  }

  // CiNii で見つからなかった場合: OPAC リダイレクトで直接確認
  try {
    const opacUrl = `${libraryInfo.opac}/opac/opac_openurl?isbn=${isbn}`;
    const redirectedOpacUrl = await getRedirectedUrl(opacUrl);
    await sleep(1000);

    if (redirectedOpacUrl !== undefined && redirectedOpacUrl.includes("bibid")) {
      return Ok({
        book: {
          ...fetchResult.book,
          [`exist_in_${libraryInfo.tag}`]: "Yes",
          [`${libraryInfo.tag.toLowerCase()}_opac`]: opacUrl
        },
        status: "owning" as const
      });
    }
  } catch (error) {
    const context = `Library: ${libraryInfo.tag}, ISBN: ${isbn}, URL: ${libraryInfo.opac}/opac/opac_openurl?isbn=${isbn}`;
    logFetcherError(error, "OPAC リダイレクト確認", context, "この OPAC 確認はスキップして処理を続行します");
  }

  return Ok({
    book: { ...fetchResult.book, [`exist_in_${libraryInfo.tag}`]: "No" },
    status: "notOwning" as const
  });
}

/**
 * CiNii 所蔵検索と数学図書館検索を実行する。
 */
export async function searchLibraries(
  fetchResult: FetchResult,
  credential: string,
  mathLibIsbnList: Set<string>,
  client: HttpClient
): Promise<Book> {
  let updatedBook = fetchResult.book;

  for (const tag of CINII_TARGET_TAGS) {
    const library = CINII_TARGETS.find((lib) => lib.tag === tag)!;
    const ciniiResult = await isBookAvailableInCinii(
      { book: updatedBook, status: fetchResult.status },
      library,
      credential,
      client
    );
    // CiNii の技術エラーは isBookAvailableInCinii 内で Ok({ status: "notOwning" }) に変換済み
    if (ciniiResult.ok && ciniiResult.value.status === "owning") {
      updatedBook = ciniiResult.value.book;
    }
  }

  const smlStatus = searchSophiaMathLib(updatedBook, mathLibIsbnList);
  if (smlStatus.status === "owning") {
    updatedBook = smlStatus.book;
  }

  return updatedBook;
}
