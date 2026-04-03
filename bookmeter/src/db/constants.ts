/**
 * db モジュールで使用する定数。
 */

export const DEFAULT_CSV_FILENAME = {
  wish: "./csv/bookmeter_wish_books.csv",
  stacked: "./csv/bookmeter_stacked_books.csv"
};

/**
 * CSVエクスポート時に含めるカラム
 */
export const CSV_EXPORT_COLUMNS = {
  wish: [
    "bookmeter_url",
    "isbn_or_asin",
    "book_title",
    "author",
    "publisher",
    "published_date",
    "exist_in_sophia",
    "exist_in_utokyo",
    "sophia_opac",
    "utokyo_opac",
    "sophia_mathlib_opac"
  ],
  stacked: ["bookmeter_url", "isbn_or_asin", "book_title", "author", "publisher", "published_date"]
} as const;
