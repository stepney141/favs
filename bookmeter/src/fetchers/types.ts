/**
 * fetchers モジュール内で共有される型定義。
 * ドメイン型（Book 等）は domain/ から re-export しない。
 */

import type { FetcherError } from "./errors";
import type { Result } from "../../../.libs/lib";
import type { Book } from "../domain/book";

export const BIBLIOINFO_SOURCES = ["OpenBD", "ISBNdb", "Amazon", "NDL", "GoogleBooks"] as const;

/** 統一された fetcher 戻り値の状態型 */
export type FetchStatus = "found" | "notFound" | "owning" | "notOwning";
export type FetchResult = { book: Book; status: FetchStatus };

/** fetcher 関数の統一戻り値型 */
export type FetcherResult = Result<FetchResult, FetcherError>;

export type BiblioinfoErrorStatus =
  | `Not_found_in_${(typeof BIBLIOINFO_SOURCES)[number]}`
  | "Not_found_in_CiNii"
  | "INVALID_ISBN"
  | "OpenBD_API_Error"
  | "ISBNdb_API_Error"
  | "NDL_API_Error"
  | "GoogleBooks_API_Error"
  | "CiNii_API_Error";

export type FetcherCredentials = {
  cinii: string;
  google: string;
  isbnDb: string;
};
