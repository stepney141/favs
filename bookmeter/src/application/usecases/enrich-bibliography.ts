import { PromiseQueue } from "../../../../.libs/utils";

import { type SequentialFetcher, buildOpenBdCommand, runSequentialFetchers } from "./fetch-bibliography-sources";
import {
  type LibraryLookupDependency,
  type MathLibraryDependency,
  resolveMathLibraryCatalog,
  runLibraryLookups
} from "./library-holdings-lookup";

import type { BibliographyLookupResult, BulkBibliographyEnricher } from "../bibliography";
import type { HttpClient } from "../interfaces/http-client";
import type { ApiCredentials } from "@/config/config";
import type { Book } from "@/domain/entities/book";
import type { AppError, Result } from "@/domain/error";
import type { BookList, BookmeterUrl } from "@/domain/types";

import { Err, Ok, isErr } from "@/domain/error";

const DEFAULT_CONCURRENCY = 5;

/**
 * Dependencies required for enriching bibliography and library holdings information.
 * This is the main dependency injection container for the use case.
 */
export type EnrichBibliographyDependencies = {
  readonly httpClient: HttpClient;
  readonly openBd: BulkBibliographyEnricher;
  readonly sequentialFetchers: readonly SequentialFetcher[];
  readonly libraryLookups: readonly LibraryLookupDependency[];
  readonly mathLibrary?: MathLibraryDependency;
  readonly credentials: ApiCredentials;
  readonly concurrency?: number;
};

/**
 * Application-service entry point for enriching a book list with bibliography and library information.
 *
 * This orchestrator follows a three-phase enrichment strategy:
 * 1. **Bulk fetch**: Queries OpenBD for all books simultaneously (fast, no rate limiting needed)
 * 2. **Sequential bibliography enrichment**: For books not found in OpenBD, tries NDL/ISBNdb/Google Books
 *    sequentially with rate limiting. Japanese ISBNs prioritize NDL; foreign ISBNs prioritize ISBNdb.
 * 3. **Library holdings lookup**: Checks CiNii and Sophia Math Library for physical availability.
 *
 * The function uses a promise queue to maintain soft concurrency limits, preventing API overload
 * while maximizing throughput.
 *
 * @param list - Map of Bookmeter URLs to Book entities to enrich
 * @param deps - All external dependencies (HTTP client, API credentials, fetchers, lookuppers)
 * @returns A Result containing the enriched book list or an error
 *
 * @example
 * ```typescript
 * const result = await enrichBibliography(bookList, {
 *   httpClient,
 *   openBd: openBdEnricher,
 *   sequentialFetchers: [ndlFetcher, isbndbFetcher],
 *   libraryLookups: [ciniiLookup],
 *   mathLibrary: sophiaLookup,
 *   credentials: apiKeys,
 *   concurrency: 5
 * });
 * ```
 */
export async function enrichBibliography(
  list: BookList,
  deps: EnrichBibliographyDependencies
): Promise<Result<BookList, AppError>> {
  if (list.size === 0) {
    return Ok(list);
  }

  // Phase 1: OpenBDの一括取得
  const bulkCommand = buildOpenBdCommand(list, deps.httpClient);
  const bulkResult = await deps.openBd(bulkCommand);
  if (isErr(bulkResult)) {
    return Err(bulkResult.err);
  }

  // 上智数学図書館のカタログの設定
  const mathCatalogResult = await resolveMathLibraryCatalog(deps.mathLibrary);
  if (isErr(mathCatalogResult)) {
    return Err(mathCatalogResult.err);
  }
  const mathCatalog = mathCatalogResult.value;

  // Phase 2 & 3: Sequential enrichment with concurrency control
  // The promise-queue lets us keep the external APIs within a soft concurrency limit
  // so we neither starve nor overload them.
  const queue = PromiseQueue();
  const concurrencyLimit = deps.concurrency ?? DEFAULT_CONCURRENCY;
  const updateTasks: Array<Promise<[BookmeterUrl, Book]>> = [];

  for (const initialResult of bulkResult.value) {
    const task = runSingleEnrichment(initialResult, deps, mathCatalog);
    queue.add(task);
    updateTasks.push(task);
    const maybeWait = queue.wait(concurrencyLimit);
    if (maybeWait !== false) {
      await maybeWait;
    }
  }

  await queue.all();
  const resolved = await Promise.all(updateTasks);
  const updatedList = new Map(list);
  for (const [bookmeterUrl, updatedBook] of resolved) {
    updatedList.set(bookmeterUrl, updatedBook);
  }

  return Ok(updatedList);
}

/**
 * Runs the complete enrichment pipeline for a single book:
 * 1. Sequential bibliography fetchers (if OpenBD didn't find it)
 * 2. Library holdings lookups (CiNii + Math Library)
 *
 * @param initialResult - Initial lookup result from OpenBD
 * @param deps - All dependencies
 * @param mathCatalog - Pre-loaded math library catalog (null if unavailable)
 * @returns A tuple of [BookmeterUrl, enriched Book]
 */
function runSingleEnrichment(
  initialResult: BibliographyLookupResult,
  deps: EnrichBibliographyDependencies,
  mathCatalog: Set<string> | null
): Promise<[BookmeterUrl, Book]> {
  return (async () => {
    const enriched = await runSequentialFetchers(
      initialResult,
      deps.sequentialFetchers,
      deps.httpClient,
      deps.credentials
    );
    const withHoldings = await runLibraryLookups(
      enriched.book,
      deps.libraryLookups,
      deps.mathLibrary,
      mathCatalog,
      deps.httpClient,
      deps.credentials
    );
    return [withHoldings.bookmeterUrl, withHoldings];
  })();
}

/**
 * Factory function to create a bibliography enricher with HTTP-based dependencies.
 * This is the primary way to instantiate the enricher for production use.
 *
 * @param deps - All required dependencies for bibliography enrichment
 * @returns A BibliographyEnricher with the enrich method bound
 */
export function createHttpBibliographyEnricher(deps: EnrichBibliographyDependencies): BibliographyEnricher {
  return {
    enrich: async (list: BookList) => await enrichBibliography(list, deps)
  };
}

type BibliographyEnricher = {
  enrich: (list: BookList) => Promise<Result<BookList, AppError>>;
};
