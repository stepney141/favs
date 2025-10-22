import { mkdir } from "node:fs/promises";
import path from "node:path";

import { open, type Database as SqliteDatabase } from "sqlite";
import { Database } from "sqlite3";

import type { Book, BookMode } from "@/domain/entities/Book";
import type { BookRepository } from "@/domain/repositories/BookRepository";

import { BookCollection } from "@/domain/entities/Book";

const TABLE_BY_MODE: Record<BookMode, string> = {
  wish: "wish",
  stacked: "stacked"
};

const INSERT_COLUMNS = [
  "bookmeter_url",
  "isbn_or_asin",
  "book_title",
  "author",
  "publisher",
  "published_date",
  "sophia_opac",
  "utokyo_opac",
  "exist_in_sophia",
  "exist_in_utokyo",
  "sophia_mathlib_opac",
  "description"
] as const;

type TableRow = {
  bookmeter_url: string;
  isbn_or_asin: string | null;
  book_title: string | null;
  author: string | null;
  publisher: string | null;
  published_date: string | null;
  sophia_opac: string | null;
  utokyo_opac: string | null;
  exist_in_sophia: string | null;
  exist_in_utokyo: string | null;
  sophia_mathlib_opac: string | null;
  description: string | null;
};

export class SqliteBookRepository implements BookRepository {
  constructor(private readonly dbPath: string) {}

  async load(mode: BookMode): Promise<BookCollection> {
    const db = await this.openDatabase();
    try {
      await this.ensureTable(db, mode);
      const rows = await db.all<TableRow[]>(`SELECT * FROM ${this.tableName(mode)}`);
      const collection = new BookCollection();
      for (const row of rows) {
        collection.upsert(this.mapRowToBook(row));
      }
      return collection;
    } finally {
      await db.close();
    }
  }

  async save(mode: BookMode, books: BookCollection): Promise<void> {
    const db = await this.openDatabase();
    try {
      await this.ensureTable(db, mode);

      const existing = await db.all<{ bookmeter_url: string; description: string | null }[]>(
        `SELECT bookmeter_url, description FROM ${this.tableName(mode)}`
      );
      const descriptionCache = new Map(existing.map((row) => [row.bookmeter_url, row.description ?? ""]));

      await db.run("BEGIN TRANSACTION");
      const placeholders = INSERT_COLUMNS.map(() => "?").join(", ");
      const insert = await db.prepare(
        `INSERT OR REPLACE INTO ${this.tableName(mode)} (${INSERT_COLUMNS.join(", ")}) VALUES (${placeholders})`
      );

      for (const book of books.values()) {
        const description = this.resolveDescription(book, descriptionCache.get(book.bookmeterUrl));
        await insert.run([
          book.bookmeterUrl,
          book.isbnOrAsin ?? "",
          book.title,
          book.author,
          book.publisher,
          book.publishedDate,
          book.sophiaOpac,
          book.utokyoOpac,
          book.existInSophia,
          book.existInUTokyo,
          book.sophiaMathlibOpac,
          description
        ]);
      }

      await insert.finalize();
      await db.run("COMMIT");
    } catch (error) {
      await db.run("ROLLBACK");
      throw error;
    } finally {
      await db.close();
    }
  }

  async removeMissing(mode: BookMode, books: BookCollection): Promise<void> {
    const db = await this.openDatabase();
    try {
      await this.ensureTable(db, mode);
      const existing = await db.all<{ bookmeter_url: string }[]>(`SELECT bookmeter_url FROM ${this.tableName(mode)}`);
      const latestKeys = new Set(books.toMap().keys());

      const toDelete = existing.filter((row) => !latestKeys.has(row.bookmeter_url));
      if (toDelete.length === 0) return;

      await db.run("BEGIN TRANSACTION");
      const stmt = await db.prepare(`DELETE FROM ${this.tableName(mode)} WHERE bookmeter_url = ?`);
      for (const row of toDelete) {
        await stmt.run(row.bookmeter_url);
      }
      await stmt.finalize();
      await db.run("COMMIT");
    } catch (error) {
      await db.run("ROLLBACK");
      throw error;
    } finally {
      await db.close();
    }
  }

  private tableName(mode: BookMode): string {
    return TABLE_BY_MODE[mode];
  }

  private async openDatabase(): Promise<SqliteDatabase> {
    const dir = path.dirname(this.dbPath);
    if (dir && dir !== ".") {
      await mkdir(dir, { recursive: true });
    }
    return open({ filename: this.dbPath, driver: Database });
  }

  private async ensureTable(db: SqliteDatabase, mode: BookMode): Promise<void> {
    await db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName(mode)} (
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
      )
    `);
  }

  private mapRowToBook(row: TableRow): Book {
    return {
      bookmeterUrl: row.bookmeter_url,
      isbnOrAsin: row.isbn_or_asin ?? "",
      title: row.book_title ?? "",
      author: row.author ?? "",
      publisher: row.publisher ?? "",
      publishedDate: row.published_date ?? "",
      sophiaOpac: row.sophia_opac ?? "",
      utokyoOpac: row.utokyo_opac ?? "",
      existInSophia: (row.exist_in_sophia as Book["existInSophia"]) ?? "No",
      existInUTokyo: (row.exist_in_utokyo as Book["existInUTokyo"]) ?? "No",
      sophiaMathlibOpac: row.sophia_mathlib_opac ?? "",
      description: row.description ?? ""
    };
  }

  private resolveDescription(book: Book, existing: string | undefined): string {
    const incoming = book.description ?? "";
    if (incoming && incoming.trim().length > 0) {
      return incoming;
    }
    return existing ?? "";
  }
}
