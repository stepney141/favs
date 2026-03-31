/**
 * 書誌情報取得の統合エントリポイント。
 * 各 fetcher を呼び出し、BookList を更新して返す。
 */

import { PromiseQueue, randomWait, sleep } from "../../../.libs/utils";
import { JOB_NAME } from "../constants";
import { isAsin, routeIsbn10 } from "../domain/isbn";

import { searchLibraries, configMathlibBookList } from "./cinii";
import { fetchGoogleBooks } from "./googlebooks";
import { fetchISBNdb } from "./isbndb";
import { fetchNDL } from "./ndl";
import { bulkFetchOpenBD } from "./openbd";

import type { HttpClient } from "./httpClient";
import type { BookSearchState, FetcherCredentials } from "./types";
import type { Book, BookList } from "../domain/book";

async function fetchSingleRequestAPIs(
  searchState: BookSearchState,
  credential: FetcherCredentials,
  mathLibIsbnList: Set<string>,
  client: HttpClient
): Promise<{ bookmeterUrl: string; updatedBook: Book }> {
  const isbn = searchState.book["isbn_or_asin"];
  if (isAsin(isbn)) {
    return {
      bookmeterUrl: searchState.book.bookmeter_url,
      updatedBook: { ...searchState.book }
    };
  }

  let updatedSearchState = { ...searchState };

  try {
    // 和書は国立国会図書館の情報を優先する
    if (routeIsbn10(isbn) === "Japan") {
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchNDL(updatedSearchState.book, client);
      }
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchISBNdb(updatedSearchState.book, credential.isbnDb, client);
      }
    } else {
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchISBNdb(updatedSearchState.book, credential.isbnDb, client);
      }
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchNDL(updatedSearchState.book, client);
      }
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    if (!updatedSearchState.isFound) {
      updatedSearchState = await fetchGoogleBooks(updatedSearchState.book, credential.google, client);
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    // CiNii 所蔵検索 + 数学図書館検索
    updatedSearchState.book = await searchLibraries(updatedSearchState, credential.cinii, mathLibIsbnList, client);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${JOB_NAME}: Error in fetchSingleRequestAPIs for ISBN ${isbn}: ${errorMessage}`);
  }

  return {
    bookmeterUrl: updatedSearchState.book.bookmeter_url,
    updatedBook: updatedSearchState.book
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
    const bookInfoList = await bulkFetchOpenBD(booklist, client);

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
