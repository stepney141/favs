import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * 読みたい本(wish)テーブルのスキーマ定義
 */
export const wishTable = sqliteTable("wish", {
  bookmeterUrl: text("bookmeter_url").primaryKey(),
  isbnOrAsin: text("isbn_or_asin"),
  bookTitle: text("book_title").notNull(),
  author: text("author").notNull(),
  publisher: text("publisher"),
  publishedDate: text("published_date"),
  existsInSophia: text("exists_in_sophia"),
  existsInUtokyo: text("exists_in_utokyo"),
  sophiaOpac: text("sophia_opac"),
  utokyoOpac: text("utokyo_opac"),
  sophiaMathLibOpac: text("sophia_mathlib_opac"),
  description: text("description")
});

/**
 * 積読本(stacked)テーブルのスキーマ定義
 */
export const stackedTable = sqliteTable("stacked", {
  bookmeterUrl: text("bookmeter_url").primaryKey(),
  isbnOrAsin: text("isbn_or_asin"),
  bookTitle: text("book_title").notNull(),
  author: text("author").notNull(),
  publisher: text("publisher"),
  publishedDate: text("published_date"),
  existsInSophia: text("exists_in_sophia"),
  existsInUtokyo: text("exists_in_utokyo"),
  sophiaOpac: text("sophia_opac"),
  utokyoOpac: text("utokyo_opac"),
  sophiaMathLibOpac: text("sophia_mathlib_opac"),
  description: text("description")
});

// 型エクスポート（Drizzleが自動生成）
export type WishBook = typeof wishTable.$inferSelect;
export type NewWishBook = typeof wishTable.$inferInsert;
export type StackedBook = typeof stackedTable.$inferSelect;
export type NewStackedBook = typeof stackedTable.$inferInsert;

// テーブルの型Union
export type BookTable = typeof wishTable | typeof stackedTable;
export type BookTableRow = WishBook | StackedBook;
