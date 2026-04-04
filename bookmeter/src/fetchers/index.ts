/**
 * 書誌情報取得の統合エントリポイント。
 * フォールバックチェーンを宣言的に定義し、BookList を更新して返す。
 */

import { PromiseQueue, randomWait, sleep } from "../../../.libs/utils";
import { JOB_NAME } from "../constants";
import { isAsin, routeIsbn10 } from "../domain/isbn";

import { searchLibraries } from "./cinii";
import { logFetcherResultError } from "./errors";
import { fetchGoogleBooks } from "./googlebooks";
import { fetchISBNdb } from "./isbndb";
import { fetchNDL } from "./ndl";
import { bulkFetchOpenBD } from "./openbd";
import { configMathlibBookList } from "./sophia";

import type { HttpClient } from "./httpClient";
import type { FetchResult, FetcherCredentials, FetcherResult } from "./types";
import type { Book, BookList } from "../domain/book";

/** 単一書籍の fetcher 関数シグネチャ */
type SingleFetcher = (book: Book, client: HttpClient) => Promise<FetcherResult>;

/** credential を閉じ込めた fetcher チェーンを生成する */
function buildFetchChain(isbn10Origin: "Japan" | "Others", credential: FetcherCredentials): SingleFetcher[] {
  const ndl: SingleFetcher = (book, client) => fetchNDL(book, client);
  const isbndb: SingleFetcher = (book, client) => fetchISBNdb(book, credential.isbnDb, client);
  const googleBooks: SingleFetcher = (book, client) => fetchGoogleBooks(book, credential.google, client);

  if (isbn10Origin === "Japan") {
    return [ndl, isbndb, googleBooks];
  } else {
    return [isbndb, ndl, googleBooks];
  }
}

/**
 * フォールバックチェーンを順次実行する。
 * status === "found" になったら打ち切り。全て notFound なら最後の結果を返す。
 */
async function runFetchChain(chain: SingleFetcher[], book: Book, client: HttpClient): Promise<FetchResult> {
  let lastResult: FetchResult = { book, status: "notFound" };

  for (const fetcher of chain) {
    const result: FetcherResult = await fetcher(book, client);

    if (!result.ok) {
      logFetcherResultError(result.err, `ISBN: ${book.isbn_or_asin}`);
      continue;
    }

    lastResult = result.value;

    if (result.value.status === "found") {
      return result.value;
    }

    await sleep(randomWait(1500, 0.8, 1.2));
  }

  return lastResult;
}

async function fetchSingleRequestAPIs(
  searchResult: FetchResult,
  credential: FetcherCredentials,
  mathLibIsbnList: Set<string>,
  client: HttpClient
): Promise<{ bookmeterUrl: string; updatedBook: Book }> {
  const isbn = searchResult.book["isbn_or_asin"];
  if (isAsin(isbn)) {
    return {
      bookmeterUrl: searchResult.book.bookmeter_url,
      updatedBook: { ...searchResult.book }
    };
  }

  // フォールバックチェーン: 書誌情報の取得
  const chain = buildFetchChain(routeIsbn10(isbn), credential);
  let updatedResult: FetchResult;

  if (searchResult.status === "found") {
    updatedResult = searchResult;
  } else {
    updatedResult = await runFetchChain(chain, searchResult.book, client);
  }

  await sleep(randomWait(1500, 0.8, 1.2));

  // CiNii 所蔵検索 + 数学図書館検索
  const updatedBook = await searchLibraries(updatedResult, credential.cinii, mathLibIsbnList, client);

  return {
    bookmeterUrl: updatedBook.bookmeter_url,
    updatedBook
  };
}

export async function fetchBiblioInfo(
  booklist: BookList,
  credential: FetcherCredentials,
  client: HttpClient
): Promise<BookList> {
  try {
    const mathLibIsbnList = await configMathlibBookList("ja", client);

    // OpenBD 一括検索
    const openBdResult = await bulkFetchOpenBD(booklist, client);

    let bookInfoList: FetchResult[];
    if (openBdResult.ok) {
      bookInfoList = openBdResult.value;
    } else {
      // OpenBD の一括取得が失敗した場合、全書籍を notFound として個別 API に回す
      logFetcherResultError(openBdResult.err, "Bulk OpenBD fetch");
      bookInfoList = Array.from(booklist.values()).map((book) => ({
        book,
        status: "notFound" as const
      }));
    }

    const ps = PromiseQueue();
    for (const bookInfo of bookInfoList) {
      ps.add(fetchSingleRequestAPIs(bookInfo, credential, mathLibIsbnList, client));
      const value = (await ps.wait(5)) as false | { bookmeterUrl: string; updatedBook: Book };
      if (value !== false) booklist.set(value.bookmeterUrl, value.updatedBook);
    }
    ((await ps.all()) as { bookmeterUrl: string; updatedBook: Book }[]).forEach((v) => {
      booklist.set(v.bookmeterUrl, v.updatedBook);
    });

    console.log(`${JOB_NAME}: Searching Completed`);
    return new Map(booklist);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${JOB_NAME}: 書誌情報の取得中にエラーが発生しました: ${errorMessage}`);
    return booklist;
  }
}
