import { createNewBook, type Book } from "../domain/entities/book";

import type { HttpClient } from "./ports/http-client";
import type { ApiCredentials } from "@/config/config";
import type { AppError, Result } from "@/domain/error";

import { type BiblioInfoSource } from "@/domain/book-sources";

// 書誌情報の取得ユースケース
export type SingleBibliographyEnricher = (
  command: SingleBibliographyLookupCommand
) => Promise<Result<BibliographyLookupResult, AppError>>;

export type BulkBibliographyEnricher = (
  command: BulkBibliographyLookupCommand
) => Promise<Result<BibliographyLookupResult[], AppError>>;

interface BibliographyLookupCommandCommon {
  readonly kind: "Pending" | "Found" | "Not_found";
  readonly target: BiblioInfoSource;
  readonly config?: {
    readonly credentials?: ApiCredentials;
    readonly useIsbn: boolean; // 検索クエリにISBNを使用するかどうか
  };
  readonly dependencies: {
    readonly httpClient: HttpClient;
  };
}

export type SingleBibliographyLookupCommand = BibliographyLookupCommandCommon & {
  readonly input: {
    readonly book: Book;
    readonly currentLookupStatus: BibliographyLookupStatus;
  };
};

export type BulkBibliographyLookupCommand = BibliographyLookupCommandCommon & {
  readonly input: {
    readonly book: Book;
    readonly currentLookupStatus: BibliographyLookupStatus;
  }[];
};

export type BibliographyLookupStatus = {
  [k in BiblioInfoSource]: boolean;
};

export type BibliographyLookupResult = {
  readonly book: Book;
} & BibliographyLookupStatus;

export type BibliographyEnricherErrorReason = "INVALID_ISBN" | `NOT_FOUND_IN_${BiblioInfoSource}`;

export function makeLookupStatusInError(
  book: Book,
  target: BiblioInfoSource,
  currentLookupStatus: BibliographyLookupStatus,
  reason: BibliographyEnricherErrorReason
): BibliographyLookupResult {
  const errorBook = createNewBook({
    bookmeterUrl: book.bookmeterUrl,
    isbnOrAsin: book.isbnOrAsin,
    title: reason,
    author: reason,
    publisher: reason,
    publishedDate: reason
  });
  return {
    book: { ...book, ...errorBook },
    ...currentLookupStatus,
    [target]: false
  };
}
