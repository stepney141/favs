import { randomWait, sleep } from "../../../../.libs/utils";

import type {
  AsyncLibraryHoldingsLookupper,
  LibraryHoldingsLookupCommand,
  LibraryHoldingsLookupper,
  LibraryLookupStatus
} from "../check-library";
import type { HttpClient } from "../interfaces/http-client";
import type { ApiCredentials } from "@/config/config";
import type { Book } from "@/domain/entities/book";
import type { AppError, Result } from "@/domain/error";

import { CINII_TARGETS, CINII_TARGET_TAGS, type CiniiTarget } from "@/domain/book-sources";
import { Err, Ok, isErr } from "@/domain/error";

// Rate limiting for library lookups to avoid being blocked
const LIBRARY_THROTTLE_BASE_MS = 1500;
const LIBRARY_THROTTLE_VARIANCE: readonly [number, number] = [0.8, 1.2];

/**
 * Represents a dependency for async library holdings lookup (e.g., CiNii).
 * Used for external library APIs that require network requests.
 */
export type LibraryLookupDependency = {
  readonly target: CiniiTarget;
  readonly lookupper: AsyncLibraryHoldingsLookupper;
};

/**
 * Represents a dependency for synchronous math library lookup (e.g., Sophia Math Library).
 * Uses a pre-loaded catalog instead of making network requests for each book.
 */
export type MathLibraryDependency = {
  readonly target?: CiniiTarget;
  readonly lookupper: LibraryHoldingsLookupper;
  readonly catalogProvider: () => Promise<Result<Set<string>, AppError>>;
};

/**
 * Runs library holdings lookups for a single book across all configured libraries.
 * Processes async lookups (CiNii) sequentially with rate limiting, then checks
 * the synchronous math library catalog if available.
 *
 * The function maintains lookup status across all libraries to track which
 * libraries have been checked and which holdings were found.
 *
 * @param book - The book to check library holdings for
 * @param libraryLookups - Array of async library lookups to perform (e.g., CiNii)
 * @param mathLibrary - Optional math library dependency with pre-loaded catalog
 * @param mathCatalog - Pre-loaded set of ISBNs in the math library (null if unavailable)
 * @param httpClient - HTTP client for making requests
 * @param credentials - API credentials for external services
 * @returns The book enriched with library holdings information
 */
export async function runLibraryLookups(
  book: Book,
  libraryLookups: readonly LibraryLookupDependency[],
  mathLibrary: MathLibraryDependency | undefined,
  mathCatalog: Set<string> | null,
  httpClient: HttpClient,
  credentials: ApiCredentials
): Promise<Book> {
  if (libraryLookups.length === 0 && (!mathLibrary || mathCatalog === null)) {
    return book;
  }

  let currentBook = book;
  let lookupStatus = createInitialLibraryLookupStatus();

  // Process async library lookups (CiNii) sequentially with rate limiting
  for (let index = 0; index < libraryLookups.length; index++) {
    const lookup = libraryLookups[index];
    const command = buildLibraryCommand(currentBook, lookupStatus, httpClient, credentials, lookup.target, undefined);
    const result = await lookup.lookupper(command);
    if (isErr(result)) {
      continue;
    }
    currentBook = result.value.book;
    lookupStatus = result.value.lookupStatus;

    if (index < libraryLookups.length - 1) {
      await waitForLibraryWindow();
    }
  }

  // Process synchronous math library lookup (no network request, just catalog check)
  if (mathLibrary !== undefined && mathCatalog !== null) {
    const mathCommand = buildLibraryCommand(
      currentBook,
      lookupStatus,
      httpClient,
      credentials,
      mathLibrary.target ?? selectDefaultMathLibraryTarget(),
      mathCatalog
    );
    const mathResult = mathLibrary.lookupper(mathCommand);
    if (!isErr(mathResult)) {
      currentBook = mathResult.value.book;
      lookupStatus = mathResult.value.lookupStatus;
    }
  }

  return currentBook;
}

/**
 * Builds a library holdings lookup command for a specific library target.
 *
 * @param book - The book to look up
 * @param lookupStatus - Current lookup status across all libraries
 * @param httpClient - HTTP client for making requests
 * @param credentials - API credentials
 * @param targetLibrary - The specific library to query
 * @param dataSource - Optional pre-loaded catalog data (for synchronous lookups)
 * @returns A library lookup command ready for execution
 */
function buildLibraryCommand(
  book: Book,
  lookupStatus: LibraryLookupStatus,
  httpClient: HttpClient,
  credentials: ApiCredentials,
  targetLibrary: CiniiTarget,
  dataSource: Set<string> | undefined
): LibraryHoldingsLookupCommand {
  return {
    kind: deriveLibraryKind(lookupStatus, targetLibrary.tag),
    input: {
      book,
      credentials,
      targetLibrary,
      lookupStatus,
      dataSource
    },
    dependencies: { httpClient }
  };
}

/**
 * Derives the command kind based on the current lookup status for a library.
 * This helps downstream processors understand whether they need to fetch new data.
 *
 * @param status - Current lookup status
 * @param tag - The library's tag identifier
 * @returns "Pending" if not yet checked, "Found" if holdings exist, "Not_found" if no holdings
 */
function deriveLibraryKind(
  status: LibraryLookupStatus,
  tag: (typeof CINII_TARGET_TAGS)[number]
): LibraryHoldingsLookupCommand["kind"] {
  const value = status[tag];
  if (value === null) return "Pending";
  return value ? "Found" : "Not_found";
}

/**
 * Creates an initial library lookup status with all libraries set to null (not yet checked).
 *
 * @returns A fresh library lookup status object
 */
export function createInitialLibraryLookupStatus(): LibraryLookupStatus {
  return CINII_TARGET_TAGS.reduce<LibraryLookupStatus>((acc, tag) => {
    acc[tag] = null;
    return acc;
  }, {} as LibraryLookupStatus);
}

/**
 * Selects the default target for math library lookups.
 * Prefers "sophia" (Sophia University) if available, otherwise uses the first target.
 *
 * @returns The default CiNii target for math library
 */
function selectDefaultMathLibraryTarget(): CiniiTarget {
  const fallback = CINII_TARGETS.find((library) => library.tag === "sophia");
  return fallback ?? CINII_TARGETS[0];
}

/**
 * Resolves the math library catalog asynchronously.
 * Returns null if no math library is configured.
 *
 * @param dependency - Optional math library dependency with catalog provider
 * @returns A Result containing the catalog set or null, or an error
 */
export async function resolveMathLibraryCatalog(
  dependency?: MathLibraryDependency
): Promise<Result<Set<string> | null, AppError>> {
  if (dependency === undefined) {
    return Ok(null);
  }
  const catalogResult = await dependency.catalogProvider();
  if (isErr(catalogResult)) {
    return Err(catalogResult.err);
  }
  return Ok(catalogResult.value);
}

/**
 * Waits for a randomized duration to respect library API rate limits.
 * Uses 1.5s base ±20% variance to avoid being blocked by library services.
 *
 * @returns A promise that resolves after the wait period
 */
function waitForLibraryWindow(): Promise<void> {
  return sleep(randomWait(LIBRARY_THROTTLE_BASE_MS, LIBRARY_THROTTLE_VARIANCE[0], LIBRARY_THROTTLE_VARIANCE[1]));
}
