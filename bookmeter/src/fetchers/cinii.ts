/**
 * CiNii Books 所蔵検索 API および数学図書館所蔵検索。
 * CiNii のレスポンス型はこのファイル内に閉じる。
 * @link https://support.nii.ac.jp/ja/cib/api/b_opensearch
 */

import fs from "node:fs/promises";

import { Ok, mapResultErr } from "../../../.libs/lib";
import { extractTextFromPDF, sleep } from "../../../.libs/utils";
import { JOB_NAME } from "../constants";
import { CINII_TARGET_TAGS } from "../domain/book";
import { convertISBN10To13, isAsin, isIsbn10, REGEX_ISBN_GLOBAL } from "../domain/isbn";

import { httpToFetcherError, logFetcherError, logFetcherResultError } from "./errors";

import type { HttpClient } from "./httpClient";
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

/**
 * OPAC のリダイレクト URL を取得する（CiNii 内部のフォールバック）。
 */
async function getRedirectedUrl(targetUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(targetUrl, { redirect: "follow" });
    return response.url;
  } catch (error) {
    console.log(error);
    return undefined;
  }
}

type CiNiiItem = {
  "@type": string;
  "@id": string;
  "dc:creator": string;
  "dc:title": string;
  "dc:publisher": string;
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
      publisher: graph.items[0]["dc:publisher"],
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
    logFetcherError(error, "OPAC リダイレクト確認", `Library: ${libraryInfo.tag}, ISBN: ${isbn}`);
  }

  return Ok({
    book: { ...fetchResult.book, [`exist_in_${libraryInfo.tag}`]: "No" },
    status: "notOwning" as const
  });
}

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
      console.log(`${JOB_NAME}: Completed fetching the list of ${listtype} books in Sophia Univ. Math Lib`);

      for await (const page of parsedPdf) {
        const matchedIsbn = page.matchAll(REGEX_ISBN_GLOBAL);
        for (const match of matchedIsbn) {
          mathlibIsbnList.add(match[0]);
          await filehandle.appendFile(`${match[0]}\n`);
        }
      }
    } catch (error) {
      logFetcherError(error, "Math Library PDF", `URL: ${url}`);
      console.error(`${JOB_NAME}: Failed to fetch or parse PDF from ${url}`);
    }
  }

  await filehandle.close();
  console.log(`${JOB_NAME}: Completed creating a list of ISBNs of ${listtype} books in Sophia Univ. Math Lib`);
  return mathlibIsbnList;
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
