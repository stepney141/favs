/**
 * CiNii Books 所蔵検索 API および数学図書館所蔵検索。
 * CiNii のレスポンス型はこのファイル内に閉じる。
 * @link https://support.nii.ac.jp/ja/cib/api/b_opensearch
 */

import fs from "node:fs/promises";

import { extractTextFromPDF, sleep } from "../../../.libs/utils";
import { CINII_TARGET_TAGS, CINII_TARGETS, JOB_NAME, MATH_LIB_BOOKLIST, REGEX } from "../constants";
import { convertISBN10To13, isAsin, isIsbn10 } from "../domain/isbn";
import { getRedirectedUrl } from "../utils";

import type { CiniiTarget } from "../constants";
import type { HttpClient } from "./httpClient";
import type { BookOwningStatus, BookSearchState } from "./types";
import type { Book } from "../domain/book";

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
  biblioInfo: BookSearchState,
  libraryInfo: CiniiTarget,
  credential: string,
  client: HttpClient
): Promise<BookOwningStatus> {
  const isbn = biblioInfo.book["isbn_or_asin"];
  const title = encodeURIComponent(biblioInfo.book["book_title"]);
  const author = encodeURIComponent(biblioInfo.book["author"]);

  if (libraryInfo === undefined) {
    throw new Error("The library info is undefined");
  }

  const query = isbn === null || isAsin(isbn) ? `title=${title}&author=${author}` : `isbn=${isbn}`;
  const url = `https://ci.nii.ac.jp/books/opensearch/search?${query}&kid=${libraryInfo.cinii_kid}&format=json&appid=${credential}`;

  try {
    const responseData = await client.get<CiniiResponse>(url);
    const graph = responseData["@graph"][0];

    if ("items" in graph) {
      const ncidUrl = graph.items[0]["@id"];
      const ncid = ncidUrl.match(REGEX.ncid_in_cinii_url)?.[0];

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

      if (biblioInfo.isFound) {
        return {
          book: { ...biblioInfo.book, ...owingStatus },
          isOwning: true
        };
      } else {
        return {
          book: { ...biblioInfo.book, ...infoToUpdate, ...owingStatus },
          isOwning: true
        };
      }
    } else {
      try {
        const opacUrl = `${libraryInfo.opac}/opac/opac_openurl?isbn=${isbn}`;
        const redirectedOpacUrl = await getRedirectedUrl(opacUrl);

        await sleep(1000);

        if (redirectedOpacUrl !== undefined && redirectedOpacUrl.includes("bibid")) {
          return {
            book: {
              ...biblioInfo.book,
              [`exist_in_${libraryInfo.tag}`]: "Yes",
              [`${libraryInfo.tag.toLowerCase()}_opac`]: opacUrl
            },
            isOwning: true
          };
        }
      } catch (error) {
        logFetcherError(error, "OPAC リダイレクト確認", `Library: ${libraryInfo.tag}, ISBN: ${isbn}`);
      }

      return {
        book: { ...biblioInfo.book, [`exist_in_${libraryInfo.tag}`]: "No" },
        isOwning: false
      };
    }
  } catch (error) {
    logFetcherError(error, "CiNii", `Library: ${libraryInfo.tag}, Query: ${query}`);
    return {
      book: { ...biblioInfo.book, [`exist_in_${libraryInfo.tag}`]: "Error" },
      isOwning: false
    };
  }
}

/**
 * 数学図書館の所蔵検索
 */
export function searchSophiaMathLib(book: Book, dataSource: Set<string>): BookOwningStatus {
  const bookId = book.isbn_or_asin;

  if (bookId === null || bookId === undefined || !isIsbn10(bookId)) {
    return { book: { ...book }, isOwning: false };
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
      isOwning: true
    };
  } else {
    return { book: { ...book }, isOwning: false };
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
        const matchedIsbn = page.matchAll(REGEX.isbn);
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
  searchState: BookSearchState,
  credential: string,
  mathLibIsbnList: Set<string>,
  client: HttpClient
): Promise<Book> {
  let updatedBook = searchState.book;

  for (const tag of CINII_TARGET_TAGS) {
    const library = CINII_TARGETS.find((lib) => lib.tag === tag)!;
    const ciniiStatus = await isBookAvailableInCinii(
      { book: updatedBook, isFound: searchState.isFound },
      library,
      credential,
      client
    );
    if (ciniiStatus.isOwning) {
      updatedBook = ciniiStatus.book;
    }
  }

  const smlStatus = searchSophiaMathLib(updatedBook, mathLibIsbnList);
  if (smlStatus.isOwning) {
    updatedBook = smlStatus.book;
  }

  return updatedBook;
}

function logFetcherError(error: unknown, apiName: string, context?: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`${JOB_NAME}: ${apiName} APIエラー` + (context ? ` (${context})` : "") + `: ${errorMessage}`);
}
