/**
 * fetchers モジュール内で共有される型定義。
 * ドメイン型（Book 等）は domain/ から re-export しない。
 */

import type { BIBLIOINFO_SOURCES } from "../constants";
import type { Book } from "../domain/book";

export type BookSearchState = { book: Book; isFound: boolean };
export type BookOwningStatus = { book: Book; isFound?: boolean; isOwning: boolean };

export type BiblioinfoErrorStatus =
  | `Not_found_in_${(typeof BIBLIOINFO_SOURCES)[number]}`
  | "INVALID_ISBN"
  | "OpenBD_API_Error"
  | "ISBNdb_API_Error"
  | "NDL_API_Error"
  | "GoogleBooks_API_Error";

export type FetcherCredentials = {
  cinii: string;
  google: string;
  isbnDb: string;
};
