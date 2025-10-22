import { open } from "sqlite";
import { Database } from "sqlite3";

import type { BookMode } from "@/domain/entities/Book";
import type { BookRepository } from "@/domain/repositories/BookRepository";

import { BookCollection } from "@/domain/entities/Book";

export class SqliteBookRepository implements BookRepository {
  constructor(private readonly dbPath: string) {}

  async load(mode: BookMode): Promise<BookCollection> {
    void mode;
    const db = await open({ filename: this.dbPath, driver: Database });
    await db.close();
    return new BookCollection();
  }

  async save(mode: BookMode, books: BookCollection): Promise<void> {
    void mode;
    void books;
    const db = await open({ filename: this.dbPath, driver: Database });
    await db.close();
  }

  async removeMissing(mode: BookMode, books: BookCollection): Promise<void> {
    void mode;
    void books;
    const db = await open({ filename: this.dbPath, driver: Database });
    await db.close();
  }
}
