/**
 * 書籍データの永続化を抽象化する BookRepository インターフェースと Drizzle 実装。
 * 同期 API（better-sqlite3）で DB 操作を行い、ファイル I/O のみ非同期。
 */

import { eq, sql } from "drizzle-orm";

import { Err, Ok } from "../../../.libs/lib";
import { exportFile } from "../../../.libs/utils";

import { DbError } from "./errors";
import { wishTable, stackedTable } from "./schema";

import type { DbClient } from "./client";
import type { Result } from "../../../.libs/lib";
import type { Book, BookList } from "../domain/book";
import type { ASIN, ISBN10 } from "../domain/isbn";

export interface BookRepository {
  load(tableName: "wish" | "stacked"): Result<BookList, DbError>;
  save(bookList: BookList, tableName: "wish" | "stacked"): Result<void, DbError>;
  updateDescription(tableName: "wish" | "stacked", isbnOrAsin: string, description: string): void;
  checkDescriptionExists(tableName: "wish" | "stacked", isbnOrAsin: string): boolean;
  exportToCsv(
    tableName: "wish" | "stacked",
    csvPath: string,
    columns: readonly string[]
  ): Promise<Result<void, DbError>>;
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

function selectAllRowsOrdered(db: DbClient, table: typeof wishTable | typeof stackedTable): Record<string, unknown>[] {
  return db
    .select()
    .from(table)
    .orderBy(sql`rowid asc`)
    .all();
}

type PersistedBookRow = {
  bookmeter_url: string;
  isbn_or_asin: string;
  book_title: string;
  author: string;
  publisher: string;
  published_date: string;
  sophia_opac: string;
  utokyo_opac: string;
  exist_in_sophia: string;
  exist_in_utokyo: string;
  sophia_mathlib_opac: string;
  description: string | null;
};

function describeSqliteValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function buildPersistedBookRow(
  book: Book,
  description: string | null,
  tableName: "wish" | "stacked"
): PersistedBookRow {
  const row = {
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
    description
  } satisfies Record<string, unknown>;

  for (const [fieldName, value] of Object.entries(row)) {
    if (typeof value === "string" || value === null) {
      continue;
    }

    throw new DbError({
      type: "invalidBookData",
      tableName,
      bookmeterUrl: book.bookmeter_url,
      fieldName,
      valueType: describeSqliteValueType(value)
    });
  }

  return row;
}

export function createDrizzleBookRepository(db: DbClient): BookRepository {
  return {
    load(tableName) {
      try {
        const table = getTable(tableName);
        const rows = selectAllRowsOrdered(db, table);
        const bookList: BookList = new Map();

        for (const row of rows) {
          const book = rowToBook(row);
          bookList.set(book.bookmeter_url, book);
        }

        return Ok(bookList);
      } catch (e) {
        return Err(new DbError({ type: "loadFailed", tableName }, { cause: e }));
      }
    },

    save(bookList, tableName) {
      try {
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

        // 現在の remote 順を rowid に反映させるため、一度全削除してから再挿入する。
        db.transaction((tx) => {
          tx.delete(table).run();

          console.log(`Re-inserting ${bookList.size} books into ${tableName} in remote order...`);
          for (const book of bookList.values()) {
            const descriptionToInsert =
              book.description !== undefined && book.description !== null && book.description !== ""
                ? book.description
                : (existingData.get(book.bookmeter_url) ?? null);
            const rowToPersist = buildPersistedBookRow(book, descriptionToInsert, tableName);
            tx.insert(table).values(rowToPersist).run();
          }
        });

        console.log(`Synchronization complete for ${tableName}.`);
        return Ok(undefined);
      } catch (e) {
        return Err(new DbError({ type: "saveFailed", tableName }, { cause: e }));
      }
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
          `Description exists for isbn_or_asin: ${isbnOrAsin} (length: ${result.description.trim().length}). Skipping fetch.`
        );
        return true;
      } else {
        console.log(
          `Description missing or empty for isbn_or_asin: ${isbnOrAsin} in table ${tableName}. Needs fetching.`
        );
        return false;
      }
    },

    async exportToCsv(tableName, csvPath, columns) {
      try {
        const table = getTable(tableName);
        console.log(`Exporting columns [${columns.join(", ")}] from table ${tableName} to CSV file ${csvPath}`);

        const allRows = selectAllRowsOrdered(db, table);

        // 指定カラムだけを抽出
        const dataToExport = allRows.map((row) => {
          const filtered: Record<string, unknown> = {};
          for (const col of columns) {
            filtered[col] = row[col];
          }
          return filtered;
        });

        console.log(`Fetched ${dataToExport.length} rows from ${tableName}.`);

        await exportFile({
          fileName: csvPath,
          payload: dataToExport,
          targetType: "csv",
          mode: "overwrite"
        });

        console.log(`Successfully exported ${dataToExport.length} books to ${csvPath}`);
        return Ok(undefined);
      } catch (e) {
        return Err(new DbError({ type: "exportFailed", csvPath }, { cause: e }));
      }
    }
  };
}
