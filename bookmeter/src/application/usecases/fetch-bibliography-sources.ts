import { randomWait, sleep } from "../../../../.libs/utils";

import type {
  BibliographyLookupResult,
  BibliographyLookupStatus,
  SingleBibliographyEnricher,
  SingleBibliographyLookupCommand,
  BulkBibliographyLookupCommand
} from "../bibliography";
import type { HttpClient } from "../interfaces/http-client";
import type { ApiCredentials } from "@/config/config";
import type { Book } from "@/domain/entities/book";
import type { BookList } from "@/domain/types";

import { BIBLIOINFO_SOURCES, type BiblioInfoSource } from "@/domain/book-sources";
import { isErr } from "@/domain/error";
import { isJapaneseIsbn, calculateFetcherPriority } from "@/domain/services/isbn-routing-service";

const OPENBD_SOURCE = "OpenBD" as const;
// Matches the legacy 1.5s ±20% back-off that kept public APIs happy.
const API_THROTTLE_BASE_MS = 1500;
const API_THROTTLE_VARIANCE: readonly [number, number] = [0.8, 1.2];

/**
 * Represents a sequential fetcher that queries a single bibliography information source.
 * Used for sources that require sequential processing with rate limiting (NDL, ISBNdb, Google Books).
 */
export type SequentialFetcher = {
  readonly target: BiblioInfoSource;
  readonly enrich: SingleBibliographyEnricher;
  readonly config?: SingleBibliographyLookupCommand["config"];
};

/**
 * Builds a bulk lookup command for OpenBD (the initial bulk fetcher).
 * OpenBD is queried first as it can handle multiple ISBNs in a single request.
 *
 * @param list - The book list to look up
 * @param httpClient - HTTP client for making requests
 * @returns A bulk command ready for execution
 */
export function buildOpenBdCommand(list: BookList, httpClient: HttpClient): BulkBibliographyLookupCommand {
  return {
    kind: "Pending",
    target: OPENBD_SOURCE,
    dependencies: { httpClient },
    input: Array.from(list.values()).map((book) => ({
      book,
      currentLookupStatus: createInitialLookupStatus()
    }))
  };
}

/**
 * Runs sequential fetchers (NDL, ISBNdb, Google Books) for a single book.
 * If OpenBD already found the book, this is skipped.
 * Otherwise, tries each source in priority order with rate limiting between attempts.
 *
 * Priority order:
 * - Japanese ISBNs: NDL → ISBNdb → Others
 * - Foreign ISBNs: ISBNdb → NDL → Others
 *
 * @param initial - The initial lookup result (typically from OpenBD)
 * @param fetchers - Array of sequential fetchers to try
 * @param httpClient - HTTP client for making requests
 * @param credentials - API credentials for external services
 * @returns The enriched lookup result
 */
export async function runSequentialFetchers(
  initial: BibliographyLookupResult,
  fetchers: readonly SequentialFetcher[],
  httpClient: HttpClient,
  credentials: ApiCredentials
): Promise<BibliographyLookupResult> {
  if (hasAnySuccessfulLookup(initial)) {
    return initial;
  }

  let current = initial;
  const orderedFetchers = orderSequentialFetchers(fetchers, initial.book);
  for (let index = 0; index < orderedFetchers.length; index++) {
    const fetcher = orderedFetchers[index];
    if (hasAnySuccessfulLookup(current)) {
      break;
    }

    const command = buildSingleCommand(current, fetcher, httpClient, credentials);
    const result = await fetcher.enrich(command);
    if (isErr(result)) {
      continue;
    }
    current = result.value;

    if (!hasAnySuccessfulLookup(current) && index < orderedFetchers.length - 1) {
      await waitForApiWindow();
    }
  }
  return current;
}

/**
 * Builds a single bibliography lookup command for a specific fetcher.
 *
 * @param current - The current lookup result state
 * @param fetcher - The fetcher to build a command for
 * @param httpClient - HTTP client for making requests
 * @param credentials - API credentials
 * @returns A single lookup command ready for execution
 */
function buildSingleCommand(
  current: BibliographyLookupResult,
  fetcher: SequentialFetcher,
  httpClient: HttpClient,
  credentials: ApiCredentials
): SingleBibliographyLookupCommand {
  return {
    kind: hasAnySuccessfulLookup(current) ? "Found" : "Pending",
    target: fetcher.target,
    config: {
      credentials,
      ...fetcher.config
    },
    dependencies: { httpClient },
    input: {
      book: current.book,
      currentLookupStatus: pickLookupStatus(current)
    }
  };
}

/**
 * Creates an initial lookup status with all sources set to false (not yet searched).
 *
 * @returns A fresh lookup status object
 */
export function createInitialLookupStatus(): BibliographyLookupStatus {
  return BIBLIOINFO_SOURCES.reduce<BibliographyLookupStatus>((acc, source) => {
    acc[source] = false;
    return acc;
  }, {} as BibliographyLookupStatus);
}

/**
 * Extracts the lookup status from a bibliography lookup result.
 *
 * @param state - The lookup result to extract status from
 * @returns A lookup status object
 */
function pickLookupStatus(state: BibliographyLookupResult): BibliographyLookupStatus {
  return BIBLIOINFO_SOURCES.reduce<BibliographyLookupStatus>((acc, source) => {
    acc[source] = state[source];
    return acc;
  }, {} as BibliographyLookupStatus);
}

/**
 * Checks if any source has successfully found bibliography information.
 *
 * @param state - The lookup result to check
 * @returns true if at least one source returned data
 */
function hasAnySuccessfulLookup(state: BibliographyLookupResult): boolean {
  return BIBLIOINFO_SOURCES.some((source) => state[source]);
}

/**
 * Orders sequential fetchers based on ISBN origin to optimize success rate.
 * Japanese ISBNs get better results from NDL, while foreign ISBNs work better with ISBNdb.
 *
 * Priority rules:
 * - Japanese ISBN: NDL (0) → ISBNdb (1) → Others (2)
 * - Foreign ISBN: ISBNdb (0) → NDL (1) → Others (2)
 *
 * @param fetchers - Available fetchers
 * @param book - The book being looked up
 * @returns Fetchers sorted by priority for this book
 */
function orderSequentialFetchers(fetchers: readonly SequentialFetcher[], book: Book): readonly SequentialFetcher[] {
  if (fetchers.length <= 1) {
    return fetchers;
  }
  const isJapan = isJapaneseIsbn(book.isbnOrAsin);
  return [...fetchers].sort((a, b) => calculateFetcherPriority(a.target, isJapan) - calculateFetcherPriority(b.target, isJapan));
}

/**
 * Waits for a randomized duration to respect API rate limits.
 * Uses 1.5s base ±20% variance to avoid hitting public API throttles.
 *
 * @returns A promise that resolves after the wait period
 */
function waitForApiWindow(): Promise<void> {
  return sleep(randomWait(API_THROTTLE_BASE_MS, API_THROTTLE_VARIANCE[0], API_THROTTLE_VARIANCE[1]));
}
