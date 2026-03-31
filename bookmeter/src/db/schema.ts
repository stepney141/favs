/**
 * Drizzle ORM スキーマ定義。
 * 既存の SQLite テーブル構造をそのまま表現する。
 */

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const bookColumns = {
  bookmeter_url: text("bookmeter_url").primaryKey(),
  isbn_or_asin: text("isbn_or_asin"),
  book_title: text("book_title"),
  author: text("author"),
  publisher: text("publisher"),
  published_date: text("published_date"),
  sophia_opac: text("sophia_opac"),
  utokyo_opac: text("utokyo_opac"),
  exist_in_sophia: text("exist_in_sophia"),
  exist_in_utokyo: text("exist_in_utokyo"),
  sophia_mathlib_opac: text("sophia_mathlib_opac"),
  description: text("description")
};

export const wishTable = sqliteTable("wish", bookColumns);
export const stackedTable = sqliteTable("stacked", bookColumns);

export type BookRow = typeof wishTable.$inferSelect;
