import { isAxiosError } from "axios";

import { PromiseQueue, randomWait, sleep } from "../../../../.libs/utils";
import { isAsin } from "../../domain/book-id";
import { CINII_TARGET_TAGS, CINII_TARGETS, JOB_NAME } from "../../domain/constants";
import {
  getErrorBookStatus,
  type BibliographyLookupCommand,
  type BibliographyLookupResult,
  type BulkBibliographyEnricher,
  type SingleBibliographyEnricher
} from "../bibliography";

import type { BookList, BookSearchState, Book, ISBN10 } from "../../domain/types";
import type { BibliographyEnricher } from "../../interface/ports";
import type { ApiCredentials } from "@/config/config";
import type { BiblioinfoSource } from "@/domain/book-sources";
import type { AppError, Result } from "@/domain/error";
import type { AxiosError } from "axios";

import { Err, isErr, Ok } from "@/domain/error";

export type BibliographyClientConfig = {
  ciniiAppId: string;
  googleBooksApiKey: string;
  isbnDbApiKey: string;
};

/**
 * エラーログの簡略化
 */
function logAxiosError(error: unknown, apiName: string, context?: string): void {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError;
    console.error(
      `${JOB_NAME}: ${apiName} APIエラー` +
        (context ? ` (${context})` : "") +
        `: ${axiosError.message}` +
        (axiosError.response ? ` [Status: ${axiosError.response.status}]` : "") +
        (axiosError.config?.url ? ` [URL: ${axiosError.config.url}]` : "")
    );
  } else {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${JOB_NAME}: ${apiName} Unknown error: ${errorMessage}`);
  }
}

type EnrichDependencies = {
  readonly openBd: BulkBibliographyEnricher;
  readonly ndl: SingleBibliographyEnricher;
  readonly isbnDb: SingleBibliographyEnricher;
  readonly googleBooks: SingleBibliographyEnricher;
};

export async function enrichBibliography(
  list: Book[],
  target: BiblioinfoSource,
  credentials: ApiCredentials,
  deps: EnrichDependencies
): Promise<Result<Book[], AppError>> {
  const commands: BibliographyLookupCommand[] = Array.from(list.values()).map((book) => ({
    kind: "Pending",
    target,
    input: { book, credentials }
  }));

  if (isAsin(command)) {
    return Err(new AppError("BIBLIOGRAPHY_ENRICHER_ERROR", "ASINは書誌情報取得の対象外です"));
  }

  const openBdResult = await deps.openBd(commands);
  if (isErr(openBdResult)) {
    return Err(openBdResult.err);
  }

  const updatedList = new Map(list);
  for (const result of openBdResult.value) {
    const finalResult = result.isFound
      ? result
      : await runSequentialFetchers(result, credentials, deps.sequentialFetchers);
    updatedList.set(finalResult.enrichedBook.bookmeterUrl, finalResult.enrichedBook);
  }

  return Ok(updatedList);
}

async function runSequentialFetchers(
  state: BibliographyLookupResult,
  credentials: ApiCredentials,
  fetchers: readonly SingleBibliographyEnricher[]
): Promise<BibliographyLookupResult> {
  let current = state;
  for (const enrich of fetchers) {
    if (current.isFound) return current;
    const command: BibliographyLookupCommand = {
      kind: current.isFound ? "Found" : "Pending",
      target: current.enrichedBook.source,
      input: { book: current.enrichedBook, credentials }
    };
    const result = await enrich(command);
    if (isErr(result)) {
      return getErrorBookStatus(command.input.book, "");
    }
    current = result.value;
  }
  return current;
}

async function fetchSingleRequestAPIs(
  searchState: BookSearchState,
  credentials: BibliographyClientConfig,
  mathLibIsbnList: Set<string>
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
    if (routeIsbn10(isbn as ISBN10) === "Japan") {
      // NDL検索
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchNDL(updatedSearchState.book);
      }

      // ISBNdb検索
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchISBNdb(updatedSearchState.book, credentials.isbnDbApiKey);
      }
    } else {
      // ISBNdb検索
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchISBNdb(updatedSearchState.book, credentials.isbnDbApiKey);
      }

      // NDL検索
      if (!updatedSearchState.isFound) {
        updatedSearchState = await fetchNDL(updatedSearchState.book);
      }
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    // GoogleBooks検索
    if (!updatedSearchState.isFound) {
      updatedSearchState = await fetchGoogleBooks(updatedSearchState.book, credentials.googleBooksApiKey);
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    // CiNii所蔵検索
    for (const tag of CINII_TARGET_TAGS) {
      const library = CINII_TARGETS.find((library) => library.tag === tag)!;
      const ciniiStatus = await isBookAvailableInCinii(updatedSearchState, library, credentials.ciniiAppId);
      if (ciniiStatus.isOwning) {
        updatedSearchState.book = ciniiStatus.book;
      }
    }

    // 数学図書館所蔵検索
    const smlStatus = searchSophiaMathLib(updatedSearchState.book, mathLibIsbnList);
    if (smlStatus.isOwning) {
      updatedSearchState.book = smlStatus.book;
    }
  } catch (error) {
    console.error(`${JOB_NAME}: Error in fetchSingleRequestAPIs for ISBN ${isbn}: ${error}`);
  }

  return {
    bookmeterUrl: updatedSearchState.book.bookmeter_url,
    updatedBook: updatedSearchState.book
  };
}

async function enrichBookList(baseList: BookList, credentials: BibliographyClientConfig): Promise<BookList> {
  try {
    const workingList = new Map(baseList);
    const mathLibIsbnList = await configMathlibBookList("ja");

    // OpenBD検索
    const bookInfoList = await bulkFetchOpenBD(workingList);

    const ps = PromiseQueue();
    for (const bookInfo of bookInfoList) {
      ps.add(fetchSingleRequestAPIs(bookInfo, credentials, mathLibIsbnList));
      const value = (await ps.wait(5)) as false | { bookmeterUrl: string; updatedBook: Book }; // 引数の指定量だけ並列実行
      if (value !== false) workingList.set(value.bookmeterUrl, value.updatedBook);
    }
    ((await ps.all()) as { bookmeterUrl: string; updatedBook: Book }[]).forEach((v) => {
      workingList.set(v.bookmeterUrl, v.updatedBook);
    }); // 端数分の処理の待ち合わせ

    console.log(`${JOB_NAME}: Searching Completed`);
    return workingList;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${JOB_NAME}: 書誌情報の取得中にエラーが発生しました: ${errorMessage}`);
    return new Map(baseList); // エラー時は元のbooklistを返す
  }
}

export function createHttpBibliographyEnricher(config: BibliographyClientConfig): BibliographyEnricher {
  return {
    enrich: async (list: BookList) => await enrichBookList(list, config)
  };
}
