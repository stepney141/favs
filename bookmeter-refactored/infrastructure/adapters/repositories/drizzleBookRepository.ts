import fs from "node:fs/promises";
import path from "node:path";

import { eq, and, isNotNull, ne, sql } from "drizzle-orm";

import type { BookRepository } from "@/application/ports/output/bookRepository";
import type { Logger } from "@/application/ports/output/logger";
import type { BookList, BookListType, Book, LibraryTag } from "@/domain/models/book";
import type { BookId, BookIdentifier } from "@/domain/models/isbn";
import type { Result } from "@/domain/models/result";
import type { DrizzleDatabase } from "@/infrastructure/database/connection";
import type { BookTableRow } from "@/infrastructure/database/schema";

import { createBook } from "@/domain/models/book";
import { DatabaseError } from "@/domain/models/errors";
import { createBookId, createISBN10, createASIN } from "@/domain/models/isbn";
import { ok, err } from "@/domain/models/result";
import { isAsin, isIsbn10 } from "@/domain/services/isbnService";
import { createDrizzleConnection, closeDrizzleConnection } from "@/infrastructure/database/connection";
import { wishTable, stackedTable } from "@/infrastructure/database/schema";

/**
 * Drizzle ORMを使用した書籍リポジトリの実装
 */
export class DrizzleBookRepository implements BookRepository {
  private readonly dbPath: string;
  private readonly logger: Logger;

  constructor(dbPath: string, logger: Logger) {
    this.dbPath = dbPath;
    this.logger = logger;
  }

  /**
   * データベース接続を取得
   */
  private async getConnection(): Promise<DrizzleDatabase> {
    try {
      // データベースファイルが置かれるディレクトリを取得
      const dbDir = path.dirname(this.dbPath);
      // ディレクトリが存在しない場合は作成
      try {
        await fs.mkdir(dbDir, { recursive: true });
        this.logger.debug(`データベースディレクトリを確認/作成しました: ${dbDir}`);
      } catch (mkdirError) {
        this.logger.error(`データベースディレクトリの作成に失敗しました: ${dbDir}`, { error: mkdirError });
        throw new DatabaseError(
          `データベースディレクトリの作成に失敗しました: ${dbDir}`,
          "connect",
          undefined,
          mkdirError
        );
      }

      // データベース接続を開く
      this.logger.debug(`データベースファイルを開きます: ${this.dbPath}`);
      return createDrizzleConnection(this.dbPath);
    } catch (error) {
      if (!(error instanceof DatabaseError)) {
        this.logger.error(`データベースファイルを開けませんでした: ${this.dbPath}`, { error });
        throw new DatabaseError(`データベースファイルを開けませんでした: ${this.dbPath}`, "connect", undefined, error);
      } else {
        this.logger.error(`データベース接続処理中にエラーが発生しました`, { error });
        throw error;
      }
    }
  }

  /**
   * テーブルを取得
   */
  private getTable(type: BookListType): typeof wishTable | typeof stackedTable {
    return type === "wish" ? wishTable : stackedTable;
  }

  /**
   * テーブル名を取得
   */
  private getTableName(type: BookListType): string {
    return type === "wish" ? "wish" : "stacked";
  }

  /**
   * RowオブジェクトをBookエンティティに変換
   */
  private rowToBook(row: BookTableRow): Book {
    const id = createBookId(row.bookmeterUrl);
    const identifier = this.parseIdentifier(row.isbnOrAsin || "");

    // 図書館情報の変換
    const existsIn = new Map<LibraryTag, boolean>();
    existsIn.set("Sophia", row.existsInSophia === "Yes");
    existsIn.set("UTokyo", row.existsInUtokyo === "Yes");

    const opacLinks = new Map<LibraryTag, string>();
    if (row.sophiaOpac) opacLinks.set("Sophia", row.sophiaOpac);
    if (row.utokyoOpac) opacLinks.set("UTokyo", row.utokyoOpac);

    return createBook({
      id,
      identifier,
      url: row.bookmeterUrl,
      title: row.bookTitle,
      author: row.author,
      publisher: row.publisher || "",
      publishedDate: row.publishedDate || "",
      description: row.description || "",
      libraryInfo: {
        existsIn,
        opacLinks,
        mathLibOpacLink: row.sophiaMathLibOpac || ""
      }
    });
  }

  /**
   * ISBNまたはASINの文字列をBookIdentifierに変換
   */
  private parseIdentifier(value: string): BookIdentifier {
    if (isIsbn10(value)) {
      return createISBN10(value);
    }
    if (isAsin(value)) {
      return createASIN(value);
    }
    return createBookId(value) as unknown as BookIdentifier;
  }

  /**
   * 指定したタイプの書籍リストをすべて取得
   */
  async findAll(type: BookListType): Promise<Result<DatabaseError, BookList>> {
    const tableName = this.getTableName(type);
    const table = this.getTable(type);
    let db: DrizzleDatabase | null = null;

    try {
      db = await this.getConnection();

      // すべての行を取得（型安全！）
      const rows = await db.select().from(table);

      // BookListに変換
      const bookList = new Map<string, Book>();
      for (const row of rows) {
        const book = this.rowToBook(row);
        bookList.set(book.url, book);
      }

      this.logger.debug(`${tableName}テーブルから${bookList.size}冊の書籍を取得しました`);
      return ok(bookList);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return err(error);
      }

      const dbError = new DatabaseError(
        `テーブル ${tableName} からのデータ取得に失敗しました`,
        "findAll",
        tableName,
        error
      );

      this.logger.error(dbError.message, { error });
      return err(dbError);
    } finally {
      if (db) closeDrizzleConnection(db);
    }
  }

  /**
   * 指定したIDの書籍を取得
   */
  async findById(id: BookId): Promise<Result<DatabaseError, BookList | null>> {
    const searchUrl = id.toString();
    let db: DrizzleDatabase | null = null;

    try {
      db = await this.getConnection();

      // wishテーブルを検索（型安全！）
      const wishRows = await db.select().from(wishTable).where(eq(wishTable.bookmeterUrl, searchUrl));

      if (wishRows.length > 0) {
        const book = this.rowToBook(wishRows[0]);
        const bookList = new Map<string, Book>();
        bookList.set(book.url, book);
        return ok(bookList);
      }

      // stackedテーブルを検索
      const stackedRows = await db.select().from(stackedTable).where(eq(stackedTable.bookmeterUrl, searchUrl));

      if (stackedRows.length > 0) {
        const book = this.rowToBook(stackedRows[0]);
        const bookList = new Map<string, Book>();
        bookList.set(book.url, book);
        return ok(bookList);
      }

      // どちらにもない場合はnullを返す
      return ok(null);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return err(error);
      }

      const dbError = new DatabaseError(`ID ${id} の書籍取得に失敗しました`, "findById", "wish/stacked", error);

      this.logger.error(dbError.message, { error, id });
      return err(dbError);
    } finally {
      if (db) closeDrizzleConnection(db);
    }
  }

  /**
   * 指定した書籍のIDに説明が存在するかどうかを確認
   */
  async hasDescription(id: BookId): Promise<Result<DatabaseError, boolean>> {
    const searchUrl = id.toString();
    let db: DrizzleDatabase | null = null;

    try {
      db = await this.getConnection();

      // wishテーブルを検索（型安全！）
      const wishRows = await db
        .select({ description: wishTable.description })
        .from(wishTable)
        .where(
          and(eq(wishTable.bookmeterUrl, searchUrl), isNotNull(wishTable.description), ne(wishTable.description, ""))
        );

      if (wishRows.length > 0) {
        return ok(true);
      }

      // stackedテーブルを検索
      const stackedRows = await db
        .select({ description: stackedTable.description })
        .from(stackedTable)
        .where(
          and(
            eq(stackedTable.bookmeterUrl, searchUrl),
            isNotNull(stackedTable.description),
            ne(stackedTable.description, "")
          )
        );

      return ok(stackedRows.length > 0);
    } catch (error) {
      const dbError =
        error instanceof DatabaseError
          ? error
          : new DatabaseError(
              `ID ${id} の説明確認中に予期せぬエラーが発生しました`,
              "hasDescription",
              "wish/stacked",
              error
            );

      this.logger.error(dbError.message, { error, id: searchUrl });
      return err(dbError);
    } finally {
      if (db) closeDrizzleConnection(db);
    }
  }

  /**
   * 書籍リストを保存
   */
  async save(books: BookList, type: BookListType): Promise<Result<DatabaseError, void>> {
    const tableName = this.getTableName(type);
    const table = this.getTable(type);
    let db: DrizzleDatabase | null = null;

    try {
      db = await this.getConnection();

      // トランザクション開始
      await db.transaction(async (tx) => {
        // 現在のURLのセットを取得
        const existingRows = await tx.select({ bookmeterUrl: table.bookmeterUrl }).from(table);

        const existingUrls = new Set(existingRows.map((row) => row.bookmeterUrl));

        // 新しいURLのセット
        const newUrls = new Set(books.keys());

        // 削除すべきURL（テーブルにあるが新しいセットにないURL）
        const urlsToDelete = [...existingUrls].filter((url) => !newUrls.has(url));

        // 削除処理
        if (urlsToDelete.length > 0) {
          for (const url of urlsToDelete) {
            await tx.delete(table).where(eq(table.bookmeterUrl, url));
          }
          this.logger.debug(`${urlsToDelete.length}冊の書籍をテーブル${tableName}から削除しました`);
        }

        // 挿入または更新処理
        for (const [url, book] of books.entries()) {
          // 図書館情報の変換
          const existsInSophia = book.libraryInfo.existsIn.get("Sophia") ? "Yes" : "No";
          const existsInUTokyo = book.libraryInfo.existsIn.get("UTokyo") ? "Yes" : "No";

          // INSERT OR REPLACE の代わりに、Drizzleの onConflict を使用
          const insertData = {
            bookmeterUrl: url,
            isbnOrAsin: book.identifier.toString(),
            bookTitle: book.title,
            author: book.author,
            publisher: book.publisher,
            publishedDate: book.publishedDate,
            existsInSophia,
            existsInUTokyo,
            sophiaOpac: book.libraryInfo.opacLinks.get("Sophia") || "",
            utokyoOpac: book.libraryInfo.opacLinks.get("UTokyo") || "",
            sophiaMathLibOpac: book.libraryInfo.mathLibOpacLink || "",
            description: book.description
          };

          await tx.insert(table).values(insertData).onConflictDoUpdate({
            target: table.bookmeterUrl,
            set: insertData
          });
        }
      });

      this.logger.debug(`${books.size}冊の書籍をテーブル${tableName}に保存しました`);
      return ok(undefined);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return err(error);
      }

      const dbError = new DatabaseError(`テーブル ${tableName} へのデータ保存に失敗しました`, "save", tableName, error);

      this.logger.error(dbError.message, { error });
      return err(dbError);
    } finally {
      if (db) closeDrizzleConnection(db);
    }
  }

  async updateDescription(id: BookId, description: string): Promise<Result<DatabaseError, void>> {
    const searchUrl = id.toString();
    let db: DrizzleDatabase | null = null;

    try {
      db = await this.getConnection();

      // wishテーブルの更新を試みる（型安全！）
      const wishResult = await db.update(wishTable).set({ description }).where(eq(wishTable.bookmeterUrl, searchUrl));

      // Drizzleでは更新された行数の確認方法が異なる場合があるため、確認のためのクエリを実行
      const wishExists = await db
        .select({ count: sql<number>`count(*)` })
        .from(wishTable)
        .where(eq(wishTable.bookmeterUrl, searchUrl));

      if (wishExists[0]?.count > 0) {
        this.logger.debug(`ID ${id} の説明を更新しました (${description.length}文字) - wish`);
        return ok(undefined);
      }

      // stackedテーブルの更新を試みる
      const stackedResult = await db
        .update(stackedTable)
        .set({ description })
        .where(eq(stackedTable.bookmeterUrl, searchUrl));

      const stackedExists = await db
        .select({ count: sql<number>`count(*)` })
        .from(stackedTable)
        .where(eq(stackedTable.bookmeterUrl, searchUrl));

      if (stackedExists[0]?.count > 0) {
        this.logger.debug(`ID ${id} の説明を更新しました (${description.length}文字) - stacked`);
        return ok(undefined);
      }

      // どちらのテーブルでも更新されなかった場合は警告をログに記録
      this.logger.warn(`ID ${id} の書籍が見つかりませんでした`);
      return ok(undefined);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return err(error);
      }

      const dbError = new DatabaseError(
        `ID ${id} の説明更新に失敗しました`,
        "updateDescription",
        "wish/stacked",
        error
      );

      this.logger.error(dbError.message, { error, id: searchUrl });
      return err(dbError);
    } finally {
      if (db) closeDrizzleConnection(db);
    }
  }
}
