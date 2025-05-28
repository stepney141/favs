/**
 * CSVエクスポート用の利用可能なカラム名の定数定義
 * 利用者がCSVエクスポート時に指定できるカラム名を定義
 * DBスキーマのsnake_case形式に合わせて定義
 */

/**
 * 基本の書籍情報カラム（DBスキーマに合わせたsnake_case）
 */
export const BASIC_BOOK_COLUMNS = [
  "bookmeter_url",
  "isbn_or_asin",
  "book_title",
  "author",
  "publisher",
  "published_date",
  "description"
] as const;

/**
 * 図書館情報カラム（DBスキーマに合わせたsnake_case）
 */
export const LIBRARY_INFO_COLUMNS = ["exists_in_utokyo", "exists_in_sophia", "sophia_mathlib_opac"] as const;

/**
 * OPACリンクカラム（DBスキーマに合わせたsnake_case）
 */
export const OPAC_LINK_COLUMNS = ["utokyo_opac", "sophia_opac"] as const;

/**
 * 利用可能な全カラム
 */
export const ALL_AVAILABLE_COLUMNS = [...BASIC_BOOK_COLUMNS, ...LIBRARY_INFO_COLUMNS, ...OPAC_LINK_COLUMNS] as const;

/**
 * 読みたい本CSVカラム
 */
export const WISH_CSV_COLUMNS = [
  "bookmeter_url",
  "isbn_or_asin",
  "book_title",
  "author",
  "publisher",
  "published_date",
  "exists_in_utokyo",
  "exists_in_sophia",
  "utokyo_opac",
  "sophia_opac",
  "sophia_mathlib_opac"
] as readonly string[];

/**
 * 積読本CSVカラム
 */
export const STACKED_CSV_COLUMNS = BASIC_BOOK_COLUMNS.filter((column) => column !== "description") as readonly string[];

/**
 * カラム名の型定義
 */
export type CsvColumnName = (typeof ALL_AVAILABLE_COLUMNS)[number];
export type BasicBookColumn = (typeof BASIC_BOOK_COLUMNS)[number];
export type LibraryInfoColumn = (typeof LIBRARY_INFO_COLUMNS)[number];
export type OpacLinkColumn = (typeof OPAC_LINK_COLUMNS)[number];
