import fs from "node:fs/promises"; // fs.promises をインポート
import path from "node:path"; // path をインポート

import { open } from "sqlite";
import sqlite3 from "sqlite3";

import type { BookRepository } from "@/application/ports/output/bookRepository";
import type { Logger } from "@/application/ports/output/logger";
import type { BookList, BookListType, Book } from "@/domain/models/book";
import type { Result } from "@/domain/models/result";
import type { BookId, BookIdentifier, LibraryTag } from "@/domain/models/valueObjects";

import { createBook } from "@/domain/models/book";
import { DatabaseError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";
import { createBookId, createISBN10, createASIN } from "@/domain/models/valueObjects";
import { isAsin, isIsbn10 } from "@/domain/services/isbnService";

// データベース接続の型定義
type DbConnection = Awaited<ReturnType<typeof open>>;

// SQLiteデータベースの行型
interface BookRow {
  bookmeter_url: string;
  isbn_or_asin: string;
  book_title: string;
  author: string;
  publisher?: string;
  published_date?: string;
  exists_in_sophia?: string;
  exists_in_utokyo?: string;
  sophia_opac?: string;
  utokyo_opac?: string;
  sophia_mathlib_opac?: string;
  description?: string;
}

/**
 * SQLiteを使用した書籍リポジトリの実装
 */
export class SqliteBookRepository implements BookRepository {
  private readonly dbPath: string;
  private readonly logger: Logger;

  constructor(dbPath: string, logger: Logger) {
    this.dbPath = dbPath;
    this.logger = logger;
  }

  /**
   * データベース接続を取得
   */
  private async getConnection(): Promise<DbConnection> {
    try {
      // データベースファイルが置かれるディレクトリを取得
      const dbDir = path.dirname(this.dbPath);
      // ディレクトリが存在しない場合は作成 (recursive: true で親ディレクトリも作成)
      try {
        await fs.mkdir(dbDir, { recursive: true });
        this.logger.debug(`データベースディレクトリを確認/作成しました: ${dbDir}`);
      } catch (mkdirError) {
        this.logger.error(`データベースディレクトリの作成に失敗しました: ${dbDir}`, { error: mkdirError });
        // ディレクトリ作成失敗も接続エラーとして扱う
        throw new DatabaseError(
          `データベースディレクトリの作成に失敗しました: ${dbDir}`,
          "connect",
          undefined,
          mkdirError
        );
      }

      // データベース接続を開く
      this.logger.debug(`データベースファイルを開きます: ${this.dbPath}`);
      return await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
    } catch (error) {
      // エラーが DatabaseError インスタンスでない場合（open 自体のエラーなど）
      if (!(error instanceof DatabaseError)) {
        this.logger.error(`データベースファイルを開けませんでした: ${this.dbPath}`, { error });
        throw new DatabaseError(`データベースファイルを開けませんでした: ${this.dbPath}`, "connect", undefined, error);
      } else {
        // DatabaseError の場合（ディレクトリ作成失敗など）はそのまま再スロー
        this.logger.error(`データベース接続処理中にエラーが発生しました`, { error });
        throw error;
      }
    }
  }

  /**
   * テーブル名を取得
   */
  private getTableName(type: BookListType): string {
    return type === "wish" ? "wish" : "stacked";
  }

  /**
   * テーブルの存在確認とテーブル作成
   */
  private async ensureTable(db: DbConnection, tableName: string): Promise<void> {
    try {
      // テーブルの存在確認
      const tableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, tableName);

      if (!tableExists) {
        // テーブルが存在しない場合は作成
        this.logger.info(`テーブル ${tableName} を作成します`);
        await db.exec(`
          CREATE TABLE ${tableName} (
            bookmeter_url TEXT PRIMARY KEY,
            isbn_or_asin TEXT,
            book_title TEXT,
            author TEXT,
            publisher TEXT,
            published_date TEXT,
            exists_in_sophia TEXT,
            exists_in_utokyo TEXT,
            sophia_opac TEXT,
            utokyo_opac TEXT,
            sophia_mathlib_opac TEXT,
            description TEXT
          )
        `);
      }
    } catch (error) {
      throw new DatabaseError(`テーブル ${tableName} の確認または作成に失敗しました`, "ensureTable", tableName, error);
    }
  }

  /**
   * RowオブジェクトをBookエンティティに変換
   */
  private rowToBook(row: BookRow): Book {
    const id = createBookId(row.bookmeter_url);
    const identifier = this.parseIdentifier(row.isbn_or_asin);

    // 図書館情報の変換
    const existsIn = new Map<LibraryTag, boolean>();
    existsIn.set("Sophia", row.exists_in_sophia === "Yes");
    existsIn.set("UTokyo", row.exists_in_utokyo === "Yes");

    const opacLinks = new Map<LibraryTag, string>();
    if (row.sophia_opac) opacLinks.set("Sophia", row.sophia_opac);
    if (row.utokyo_opac) opacLinks.set("UTokyo", row.utokyo_opac);

    return createBook({
      id,
      identifier,
      url: row.bookmeter_url,
      title: row.book_title,
      author: row.author,
      publisher: row.publisher || "",
      publishedDate: row.published_date || "",
      description: row.description || "",
      libraryInfo: {
        existsIn,
        opacLinks,
        mathLibOpacLink: row.sophia_mathlib_opac || ""
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
    // デフォルトはBookIdとして扱う（型としてはここでは問題ない）
    return createBookId(value) as unknown as BookIdentifier;
  }

  /**
   * 指定したタイプの書籍リストをすべて取得
   */
  async findAll(type: BookListType): Promise<Result<DatabaseError, BookList>> {
    const tableName = this.getTableName(type);
    let db: DbConnection | null = null;

    try {
      db = await this.getConnection();
      await this.ensureTable(db, tableName);

      // すべての行を取得
      const rows = await db.all<BookRow[]>(`SELECT * FROM ${tableName}`);

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
      if (db) await db.close();
    }
  }

  /**
   * 指定したIDの書籍を取得
   */
  async findById(id: BookId): Promise<Result<DatabaseError, BookList | null>> {
    // BookIdは現在のシステムではbookmeter_urlと同等のため、
    // そのURLで書籍を検索
    const searchUrl = id.toString();
    let db: DbConnection | null = null;

    try {
      db = await this.getConnection();

      // wishテーブルを検索
      const row = await db.get<BookRow>("SELECT * FROM wish WHERE bookmeter_url = ?", searchUrl);

      if (!row) {
        // wishになければstackedテーブルを検索
        const stackedRow = await db.get<BookRow>("SELECT * FROM stacked WHERE bookmeter_url = ?", searchUrl);

        if (!stackedRow) {
          // どちらにもない場合はnullを返す
          return ok(null);
        }

        // 書籍に変換
        const book = this.rowToBook(stackedRow);
        const bookList = new Map<string, Book>();
        bookList.set(book.url, book);

        return ok(bookList);
      }

      // 書籍に変換（wishテーブルの場合）
      const book = this.rowToBook(row);
      const bookList = new Map<string, Book>();
      bookList.set(book.url, book);

      return ok(bookList);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return err(error);
      }

      const dbError = new DatabaseError(`ID ${id} の書籍取得に失敗しました`, "findById", "wish/stacked", error);

      this.logger.error(dbError.message, { error, id });
      return err(dbError);
    } finally {
      if (db) await db.close();
    }
  }

  /**
   * 書籍リストを保存
   */
  async save(books: BookList, type: BookListType): Promise<Result<DatabaseError, void>> {
    const tableName = this.getTableName(type);
    let db: DbConnection | null = null;

    try {
      db = await this.getConnection();
      await this.ensureTable(db, tableName);

      // トランザクション開始
      await db.run("BEGIN TRANSACTION");

      // 現在のURLのセットを取得
      const existingRows = await db.all<{ bookmeter_url: string }[]>(`SELECT bookmeter_url FROM ${tableName}`);
      const existingUrls = new Set(existingRows.map((row) => row.bookmeter_url));

      // 新しいURLのセット
      const newUrls = new Set(books.keys());

      // 削除すべきURL（テーブルにあるが新しいセットにないURL）
      const urlsToDelete = [...existingUrls].filter((url) => !newUrls.has(url));

      // 削除処理
      if (urlsToDelete.length > 0) {
        const deleteStmt = await db.prepare(`DELETE FROM ${tableName} WHERE bookmeter_url = ?`);

        for (const url of urlsToDelete) {
          await deleteStmt.run(url);
        }

        await deleteStmt.finalize();
        this.logger.debug(`${urlsToDelete.length}冊の書籍をテーブル${tableName}から削除しました`);
      }

      // 挿入または更新処理
      const insertStmt = await db.prepare(`
        INSERT OR REPLACE INTO ${tableName} (
          bookmeter_url,
          isbn_or_asin,
          book_title,
          author,
          publisher,
          published_date,
          exists_in_sophia,
          exists_in_utokyo,
          sophia_opac,
          utokyo_opac,
          sophia_mathlib_opac,
          description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const [url, book] of books.entries()) {
        // 図書館情報の変換
        const existsInSophia = book.libraryInfo.existsIn.get("Sophia") ? "Yes" : "No";
        const existsInUTokyo = book.libraryInfo.existsIn.get("UTokyo") ? "Yes" : "No";

        await insertStmt.run(
          url,
          book.identifier.toString(),
          book.title,
          book.author,
          book.publisher,
          book.publishedDate,
          existsInSophia,
          existsInUTokyo,
          book.libraryInfo.opacLinks.get("Sophia") || "",
          book.libraryInfo.opacLinks.get("UTokyo") || "",
          book.libraryInfo.mathLibOpacLink || "",
          book.description
        );
      }

      await insertStmt.finalize();

      // トランザクションのコミット
      await db.run("COMMIT");

      this.logger.debug(`${books.size}冊の書籍をテーブル${tableName}に保存しました`);
      return ok(undefined);
    } catch (error) {
      // エラー発生時はロールバック
      if (db) {
        await db.run("ROLLBACK");
      }

      if (error instanceof DatabaseError) {
        return err(error);
      }

      const dbError = new DatabaseError(`テーブル ${tableName} へのデータ保存に失敗しました`, "save", tableName, error);

      this.logger.error(dbError.message, { error });
      return err(dbError);
    } finally {
      if (db) await db.close();
    }
  }

  /**
   * 指定した書籍のIDに説明が存在するかどうかを確認
   */
  async hasDescription(id: BookId): Promise<Result<DatabaseError, boolean>> {
    const searchUrl = id.toString();
    let db: DbConnection | null = null;

    try {
      db = await this.getConnection();
      let descriptionExists = false;

      // wishテーブルを検索 (テーブルが存在しない場合はスキップ)
      try {
        const wishResult = await db.get<{ description: string }>(
          'SELECT description FROM wish WHERE bookmeter_url = ? AND description IS NOT NULL AND description != ""',
          searchUrl
        );
        if (wishResult) {
          descriptionExists = true;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("no such table: wish")) {
          this.logger.debug("テーブル 'wish' が存在しないため、説明の確認をスキップします。", { id: searchUrl });
        } else {
          // その他のDBエラーは上位に投げる
          throw new DatabaseError(`wishテーブルの説明確認中にエラーが発生しました`, "hasDescription", "wish", error);
        }
      }

      // stackedテーブルを検索 (テーブルが存在しない場合、またはwishで見つかっていない場合)
      if (!descriptionExists) {
        try {
          const stackedResult = await db.get<{ description: string }>(
            'SELECT description FROM stacked WHERE bookmeter_url = ? AND description IS NOT NULL AND description != ""',
            searchUrl
          );
          if (stackedResult) {
            descriptionExists = true;
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("no such table: stacked")) {
            this.logger.debug("テーブル 'stacked' が存在しないため、説明の確認をスキップします。", { id: searchUrl });
          } else {
            // その他のDBエラーは上位に投げる
            throw new DatabaseError(
              `stackedテーブルの説明確認中にエラーが発生しました`,
              "hasDescription",
              "stacked",
              error
            );
          }
        }
      }

      return ok(descriptionExists);
    } catch (error) {
      // ここに来るのは、テーブル存在チェック以外のDBエラー
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
      if (db) await db.close();
    }
  }

  /**
   * 指定した書籍の説明を更新
   */
  async updateDescription(id: BookId, description: string): Promise<Result<DatabaseError, void>> {
    // BookIdは現在のシステムではbookmeter_urlと同等のため、
    // そのURLで書籍を検索
    const searchUrl = id.toString();
    let db: DbConnection | null = null;

    try {
      db = await this.getConnection();

      // wishテーブルの更新を試みる
      const wishResult = await db.run(
        "UPDATE wish SET description = ? WHERE bookmeter_url = ?",
        description,
        searchUrl
      );

      // 更新された行がなければstackedテーブルを更新
      if (wishResult.changes === 0) {
        const stackedResult = await db.run(
          "UPDATE stacked SET description = ? WHERE bookmeter_url = ?",
          description,
          searchUrl
        );

        // どちらのテーブルでも更新されなかった場合は警告をログに記録
        if (stackedResult.changes === 0) {
          this.logger.warn(`ID ${id} の書籍が見つかりませんでした`);
        } else {
          this.logger.debug(`ID ${id} の説明を更新しました (${description.length}文字)`);
        }
      } else {
        this.logger.debug(`ID ${id} の説明を更新しました (${description.length}文字)`);
      }

      return ok(undefined);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return err(error);
      }

      // 元の SQLite エラーの詳細をログに出力
      const originalErrorDetails: Record<string, unknown> = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
      if (error && typeof error === "object") {
        if ("code" in error) originalErrorDetails.code = error.code;
        if ("errno" in error) originalErrorDetails.errno = error.errno;
      }
      this.logger.error(`SQLiteエラーが発生しました (updateDescription)`, {
        originalError: originalErrorDetails,
        id: searchUrl
      });

      const dbError = new DatabaseError(
        `ID ${id} の説明更新に失敗しました`,
        "updateDescription",
        "wish/stacked",
        error
      );

      // DatabaseError のログは維持するが、元のエラー情報は上記で出力済み
      this.logger.error(dbError.message, { error: dbError, id: searchUrl });
      return err(dbError);
    } finally {
      if (db) await db.close();
    }
  }
}
