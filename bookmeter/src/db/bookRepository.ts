/**
 * 書籍データの永続化を抽象化する BookRepository インターフェースと Drizzle 実装。
 * 同期 API（better-sqlite3）で DB 操作を行い、ファイル I/O のみ非同期。
 */

import { eq, sql } from "drizzle-orm";

import { exportFile } from "../../../.libs/utils";
import { JOB_NAME } from "../constants";

import { wishTable, stackedTable } from "./schema";

import type { DbClient } from "./client";
import type { Book, BookList } from "../domain/book";
import type { ASIN, ISBN10 } from "../domain/isbn";

export interface BookRepository {
  load(tableName: "wish" | "stacked"): BookList;
  save(bookList: BookList, tableName: "wish" | "stacked"): void;
  updateDescription(tableName: "wish" | "stacked", isbnOrAsin: string, description: string): void;
  checkDescriptionExists(tableName: "wish" | "stacked", isbnOrAsin: string): boolean;
  exportToCsv(tableName: "wish" | "stacked", csvPath: string, columns: readonly string[]): Promise<void>;
}

function getTable(tableName: "wish" | "stacked"): typeof wishTable | typeof stackedTable {
  return tableName === "wish" ? wishTable : stackedTable;
}

function rowToBook(row: Record<string, unknown>): Book {
  return {
    bookmeter_url: (row.bookmeter_url as string) ?? "",
    isbn_or_asin: (row.isbn_or_asin as ISBN10 | ASIN) ?? ("" as ISBN10),
    book_title: (row.book_title as string) ?? "",
    author: (row.author as string) ?? "",
    publisher: (row.publisher as string) ?? "",
    published_date: (row.published_date as string) ?? "",
    sophia_opac: (row.sophia_opac as string) ?? "",
    utokyo_opac: (row.utokyo_opac as string) ?? "",
    exist_in_sophia: (row.exist_in_sophia as "Yes" | "No") ?? "No",
    exist_in_utokyo: (row.exist_in_utokyo as "Yes" | "No") ?? "No",
    sophia_mathlib_opac: (row.sophia_mathlib_opac as string) ?? "",
    description: (row.description as string) ?? ""
  };
}

export function createDrizzleBookRepository(db: DbClient): BookRepository {
  return {
    load(tableName) {
      const table = getTable(tableName);
      const rows = db.select().from(table).all();
      const bookList: BookList = new Map();

      for (const row of rows) {
        const book = rowToBook(row);
        bookList.set(book.bookmeter_url, book);
      }

      return bookList;
    },

    save(bookList, tableName) {
      const table = getTable(tableName);

      console.log(`Synchronizing book list with database table: ${tableName}`);

      // テーブルが存在しない場合は作成（Drizzle のマイグレーション未使用時のフォールバック）
      db.run(sql`CREATE TABLE IF NOT EXISTS ${table} (
        bookmeter_url TEXT PRIMARY KEY,
        isbn_or_asin TEXT,
        book_title TEXT,
        author TEXT,
        publisher TEXT,
        published_date TEXT,
        sophia_opac TEXT,
        utokyo_opac TEXT,
        exist_in_sophia TEXT,
        exist_in_utokyo TEXT,
        sophia_mathlib_opac TEXT,
        description TEXT
      )`);

      // 既存の description を保持するために先に取得
      const existingRows = db
        .select({
          bookmeter_url: table.bookmeter_url,
          description: table.description
        })
        .from(table)
        .all();
      const existingData = new Map(existingRows.map((row) => [row.bookmeter_url, row.description]));
      const existingUrls = new Set(existingRows.map((row) => row.bookmeter_url));
      const newUrls = new Set(bookList.keys());

      // トランザクションで一括処理
      db.transaction((tx) => {
        // 削除
        const urlsToDelete = [...existingUrls].filter((url) => !newUrls.has(url));
        if (urlsToDelete.length > 0) {
          console.log(`Deleting ${urlsToDelete.length} books from ${tableName}...`);
          for (const url of urlsToDelete) {
            tx.delete(table).where(eq(table.bookmeter_url, url)).run();
          }
        }

        // 挿入 / 更新
        console.log(`Inserting/Updating ${bookList.size} books into ${tableName}...`);
        for (const book of bookList.values()) {
          const descriptionToInsert =
            book.description !== undefined && book.description !== null && book.description !== ""
              ? book.description
              : (existingData.get(book.bookmeter_url) ?? null);

          tx.insert(table)
            .values({
              bookmeter_url: book.bookmeter_url,
              isbn_or_asin: book.isbn_or_asin,
              book_title: book.book_title,
              author: book.author,
              publisher: book.publisher,
              published_date: book.published_date,
              sophia_opac: book.sophia_opac,
              utokyo_opac: book.utokyo_opac,
              exist_in_sophia: book.exist_in_sophia,
              exist_in_utokyo: book.exist_in_utokyo,
              sophia_mathlib_opac: book.sophia_mathlib_opac,
              description: descriptionToInsert
            })
            .onConflictDoUpdate({
              target: table.bookmeter_url,
              set: {
                isbn_or_asin: book.isbn_or_asin,
                book_title: book.book_title,
                author: book.author,
                publisher: book.publisher,
                published_date: book.published_date,
                sophia_opac: book.sophia_opac,
                utokyo_opac: book.utokyo_opac,
                exist_in_sophia: book.exist_in_sophia,
                exist_in_utokyo: book.exist_in_utokyo,
                sophia_mathlib_opac: book.sophia_mathlib_opac,
                description: descriptionToInsert
              }
            })
            .run();
        }
      });

      console.log(`Synchronization complete for ${tableName}.`);
    },

    updateDescription(tableName, isbnOrAsin, description) {
      const table = getTable(tableName);
      const result = db.update(table).set({ description }).where(eq(table.isbn_or_asin, isbnOrAsin)).run();

      if (result.changes === 0) {
        console.log(`No book found with isbn_or_asin: ${isbnOrAsin}`);
      } else {
        console.log(`Description updated for isbn_or_asin: ${isbnOrAsin}`);
      }
    },

    checkDescriptionExists(tableName, isbnOrAsin) {
      const table = getTable(tableName);
      const result = db
        .select({ description: table.description })
        .from(table)
        .where(eq(table.isbn_or_asin, isbnOrAsin))
        .get();

      if (result && result.description && result.description.trim().length > 0) {
        console.log(
          `${JOB_NAME}: Description exists for isbn_or_asin: ${isbnOrAsin} (length: ${result.description.trim().length}). Skipping fetch.`
        );
        return true;
      } else {
        console.log(
          `${JOB_NAME}: Description missing or empty for isbn_or_asin: ${isbnOrAsin} in table ${tableName}. Needs fetching.`
        );
        return false;
      }
    },

    async exportToCsv(tableName, csvPath, columns) {
      const table = getTable(tableName);
      console.log(
        `${JOB_NAME}: Exporting columns [${columns.join(", ")}] from table ${tableName} to CSV file ${csvPath}`
      );

      const allRows = db.select().from(table).all();

      // 指定カラムだけを抽出
      const dataToExport = allRows.map((row) => {
        const filtered: Record<string, unknown> = {};
        for (const col of columns) {
          filtered[col] = (row as Record<string, unknown>)[col];
        }
        return filtered;
      });

      console.log(`${JOB_NAME}: Fetched ${dataToExport.length} rows from ${tableName}.`);

      await exportFile({
        fileName: csvPath,
        payload: dataToExport,
        targetType: "csv",
        mode: "overwrite"
      });

      console.log(`${JOB_NAME}: Successfully exported ${dataToExport.length} books to ${csvPath}`);
    }
  };
}
