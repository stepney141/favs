import type { BookMode } from "@/domain/entities/Book";

export const CSV_EXPORT_COLUMNS: Record<BookMode, readonly string[]> = {
  wish: [
    "bookmeter_url",
    "isbn_or_asin",
    "book_title",
    "author",
    "publisher",
    "published_date",
    "exist_in_sophia",
    "exist_in_uTokyo",
    "sophia_opac",
    "utokyo_opac",
    "sophia_mathlib_opac"
  ],
  stacked: [
    "bookmeter_url",
    "isbn_or_asin",
    "book_title",
    "author",
    "publisher",
    "published_date"
  ]
};
