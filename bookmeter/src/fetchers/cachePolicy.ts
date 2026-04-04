/**
 * 既存キャッシュを再利用するかどうかの判定を純粋関数として定義する。
 * fetchers/index.ts から分離し、ユニットテストしやすくする。
 */

import type { Book } from "../domain/book";

const BIBLIO_FIELDS = ["book_title", "author", "publisher", "published_date"] as const;

function isMissingFieldValue(value: string): boolean {
  return (
    value.trim() === "" || value.startsWith("Not_found_in_") || value.endsWith("_API_Error") || value === "INVALID_ISBN"
  );
}

export function hasCompleteCachedBiblio(book: Book): boolean {
  return BIBLIO_FIELDS.every((fieldName) => !isMissingFieldValue(book[fieldName]));
}

export function shouldFetchBibliographicData(book: Book, forceRefresh: boolean): boolean {
  if (forceRefresh) {
    return true;
  }

  return !hasCompleteCachedBiblio(book);
}

export function shouldFetchLibraryHoldings(
  book: Book,
  forceRefresh: boolean,
  cachedBookUrls: ReadonlySet<string>
): boolean {
  if (forceRefresh) {
    return true;
  }

  return cachedBookUrls.has(book.bookmeter_url) !== true;
}
