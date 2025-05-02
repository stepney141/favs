import fs from "node:fs";

import { open } from "sqlite";
import sqlite3 from "sqlite3";

import { exportFile } from "../../../../.libs/utils";
import { BookListImpl } from "../../../domain/models/book";
import { failure, success } from "../../../domain/models/valueObjects";

import { BaseRepository } from "./baseRepository";

import type { BookRepository } from "../../../application/ports/output/bookRepository";
import type { Book, BookList, LibraryAvailability } from "../../../domain/models/book";
import type { BookListType, Result, LibraryId, BookId, ISBN10, ISBN13, ASIN } from "../../../domain/models/valueObjects";
import type { Database } from "sqlite";

/**
 * SQLite用の書籍リポジトリ実装
 */
export class SqliteBookRepository extends BaseRepository<BookList, BookListType> implements BookRepository {
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  private readonly dbPath: string;
  private readonly logPrefix: string;
  
  /**
   * コンストラクタ
   * @param dbPath SQLiteデータベースファイルのパス
   * @param logPrefix ログのプレフィックス（任意）
   */
  constructor(dbPath: string, logPrefix = "SQLite") {
    super();
    this.dbPath = dbPath;
    this.logPrefix = logPrefix;
  }
  
  /**
   * SQLiteデータベースに接続する
   * @returns 接続結果
   */
  async connect(): Promise<Result<void>> {
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
      
      return success(undefined);
    } catch (error) {
      return this.wrapError(error, `${this.logPrefix}: データベース接続に失敗しました`);
    }
  }
  
  /**
   * SQLiteデータベースから切断する
   * @returns 切断結果
   */
  async disconnect(): Promise<Result<void>> {
    try {
      if (this.db) {
        await this.db.close();
        this.db = null;
      }
      return success(undefined);
    } catch (error) {
      return this.wrapError(error, `${this.logPrefix}: データベース切断に失敗しました`);
    }
  }
  
  /**
   * 指定した種類の書籍リストが存在するかどうかを確認する
   * @param type 書籍リストの種類
   * @returns 存在確認結果
   */
  async exists(type: BookListType): Promise<Result<boolean>> {
    try {
      const connectResult = await this.connect();
      if (connectResult.type === "failure") {
        return connectResult;
      }
      
      if (!this.db) {
        return failure(new Error(`${this.logPrefix}: データベース接続が確立されていません`));
      }
      
      const safeTableName = this.sanitizeTableName(type);
      
      // テーブルが存在するか確認
      const row = await this.db.get<{ name: string } | undefined>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, 
        safeTableName
      );
      
      const tableExists = !!row;
      
      if (!tableExists) {
        await this.disconnect();
        return success(false);
      }
      
      // 書籍数をカウント
      const countResult = await this.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${safeTableName}`
      );
      
      const count = countResult?.count || 0;
      
      await this.disconnect();
      return success(count > 0);
    } catch (error) {
      await this.disconnect().catch(() => {/* エラーを無視 */});
      return this.wrapError(error, `${this.logPrefix}: 書籍リストの存在確認に失敗しました`);
    }
  }
  
  /**
   * 書籍リストを保存する
   * @param books 保存する書籍リスト
   * @returns 保存結果
   */
  async save(books: BookList): Promise<Result<void>> {
    try {
      const connectResult = await this.connect();
      if (connectResult.type === "failure") {
        return connectResult;
      }
      
      if (!this.db) {
        return failure(new Error(`${this.logPrefix}: データベース接続が確立されていません`));
      }
      
      const safeTableName = this.sanitizeTableName(books.type);
      
      // テーブルを作成
      await this.createTable(safeTableName);
      
      // トランザクション開始
      await this.db.exec("BEGIN TRANSACTION");
      
      try {
        // 既存のブックマークURLをすべて取得
        const existingRows = await this.db.all<Array<{ bookmeter_url: string }>>(
          `SELECT bookmeter_url FROM ${safeTableName}`
        );
        
        const existingUrls = new Set(existingRows.map(row => row.bookmeter_url));
        
        // 削除されたURLを特定して削除
        const urlsToDelete = [...existingUrls].filter(url => {
          for (const book of books.items.values()) {
            if (book.bookmeterUrl === url) return false;
          }
          return true;
        });
        
        // 削除処理
        for (const url of urlsToDelete) {
          await this.db.run(
            `DELETE FROM ${safeTableName} WHERE bookmeter_url = ?`, 
            url
          );
        }
        
        // 新規追加または更新
        for (const book of books.items.values()) {
          await this.saveBook(safeTableName, book);
        }
        
        // トランザクションコミット
        await this.db.exec("COMMIT");
        
        console.log(`${this.logPrefix}: ${books.size()}冊の書籍を保存しました`);
        await this.disconnect();
        return success(undefined);
      } catch (error) {
        // エラー発生時はロールバック
        await this.db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      await this.disconnect().catch(() => {/* エラーを無視 */});
      return this.wrapError(error, `${this.logPrefix}: 書籍リストの保存に失敗しました`);
    }
  }
  
  /**
   * 書籍を保存する
   * @param tableName テーブル名
   * @param book 書籍
   * @private
   */
  private async saveBook(tableName: string, book: Book): Promise<void> {
    if (!this.db) {
      throw new Error(`${this.logPrefix}: データベース接続が確立されていません`);
    }
    
    // 図書館情報をフォーマット
    const libraryInfo = {
      sophia_opac: "",
      utokyo_opac: "",
      exist_in_Sophia: "No",
      exist_in_UTokyo: "No",
      sophia_mathlib_opac: ""
    };
    
    // 上智大学
    const sophiaInfo = book.libraryAvailability.get("sophia" as LibraryId);
    if (sophiaInfo?.isAvailable) {
      libraryInfo.exist_in_Sophia = "Yes";
      libraryInfo.sophia_opac = sophiaInfo.opacUrl || "";
    }
    
    // 東京大学
    const utokyoInfo = book.libraryAvailability.get("utokyo" as LibraryId);
    if (utokyoInfo?.isAvailable) {
      libraryInfo.exist_in_UTokyo = "Yes";
      libraryInfo.utokyo_opac = utokyoInfo.opacUrl || "";
    }
    
    // 数学図書館
    const mathlibInfo = book.libraryAvailability.get("sophia-mathlib" as LibraryId);
    if (mathlibInfo?.isAvailable) {
      libraryInfo.sophia_mathlib_opac = mathlibInfo.opacUrl || "";
    }
    
    // 挿入または更新
    await this.db.run(
      `INSERT OR REPLACE INTO ${tableName} (
        bookmeter_url, isbn_or_asin, book_title, author, publisher, published_date,
        sophia_opac, utokyo_opac, exist_in_Sophia, exist_in_UTokyo, sophia_mathlib_opac,
        description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        book.bookmeterUrl,
        book.isbn.toString(),
        book.title,
        book.author,
        book.publisher,
        book.publishedDate,
        libraryInfo.sophia_opac,
        libraryInfo.utokyo_opac,
        libraryInfo.exist_in_Sophia,
        libraryInfo.exist_in_UTokyo,
        libraryInfo.sophia_mathlib_opac,
        book.description || null
      ]
    );
  }
  
  /**
   * テーブルを作成する
   * @param tableName テーブル名
   * @private
   */
  private async createTable(tableName: string): Promise<void> {
    if (!this.db) {
      throw new Error(`${this.logPrefix}: データベース接続が確立されていません`);
    }
    
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        bookmeter_url TEXT PRIMARY KEY,
        isbn_or_asin TEXT,
        book_title TEXT,
        author TEXT,
        publisher TEXT,
        published_date TEXT,
        sophia_opac TEXT,
        utokyo_opac TEXT,
        exist_in_Sophia TEXT,
        exist_in_UTokyo TEXT,
        sophia_mathlib_opac TEXT,
        description TEXT
      )
    `);
  }

  /**
   * 指定した種類の書籍リストを取得する
   * @param type 書籍リストの種類
   * @returns 書籍リスト
   */
  async findAll(type: BookListType): Promise<Result<BookList>> {
    try {
      // データベースファイルの存在確認
      const dbExists = fs.existsSync(this.dbPath);
      if (!dbExists) {
        return failure(new Error(`${this.logPrefix}: データベースファイル ${this.dbPath} が存在しません`));
      }
      
      const connectResult = await this.connect();
      if (connectResult.type === "failure") {
        return connectResult;
      }
      
      if (!this.db) {
        return failure(new Error(`${this.logPrefix}: データベース接続が確立されていません`));
      }
      
      const safeTableName = this.sanitizeTableName(type);
      
      // テーブルが存在するか確認
      const tableExistsResult = await this.db.get<{ name: string } | undefined>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, 
        safeTableName
      );
      
      if (!tableExistsResult) {
        await this.disconnect();
        return success(BookListImpl.createEmpty(type));
      }
      
      // 全ての行を取得
      const rows = await this.db.all(
        `SELECT * FROM ${safeTableName}`
      );
      
      // 結果を書籍オブジェクトに変換
      const books: Book[] = rows.map(row => this.rowToBook(row));
      
      await this.disconnect();
      
      return success(BookListImpl.fromArray(books, type));
    } catch (error) {
      await this.disconnect().catch(() => {/* エラーを無視 */});
      return this.wrapError(error, `${this.logPrefix}: 書籍リストの取得に失敗しました`);
    }
  }
  
  /**
   * データベースの行を書籍オブジェクトに変換する
   * @param row データベースの行
   * @returns 書籍オブジェクト
   * @private
   */
  private rowToBook(row: unknown): Book {
    // SQLiteの行をオブジェクトとして扱う
    const bookData = row as {
      bookmeter_url: string;
      isbn_or_asin: string;
      book_title: string;
      author: string;
      publisher: string;
      published_date: string;
      sophia_opac: string;
      utokyo_opac: string;
      exist_in_Sophia: string;
      exist_in_UTokyo: string;
      sophia_mathlib_opac: string;
      description: string | null;
    };
    
    // 図書館の蔵書情報
    const libraryAvailability = new Map<LibraryId, LibraryAvailability>();
    
    // 上智大学
    if (bookData.exist_in_Sophia === "Yes") {
      libraryAvailability.set("sophia" as LibraryId, {
        isAvailable: true,
        opacUrl: bookData.sophia_opac
      });
    }
    
    // 東京大学
    if (bookData.exist_in_UTokyo === "Yes") {
      libraryAvailability.set("utokyo" as LibraryId, {
        isAvailable: true,
        opacUrl: bookData.utokyo_opac
      });
    }
    
    // 数学図書館
    if (bookData.sophia_mathlib_opac) {
      libraryAvailability.set("sophia-mathlib" as LibraryId, {
        isAvailable: true,
        opacUrl: bookData.sophia_mathlib_opac
      });
    }
    
    // 書籍オブジェクトを作成
    return {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 10)}` as BookId,
      isbn: bookData.isbn_or_asin as ISBN10 | ISBN13 | ASIN,
      title: bookData.book_title,
      author: bookData.author,
      publisher: bookData.publisher,
      publishedDate: bookData.published_date,
      bookmeterUrl: bookData.bookmeter_url,
      libraryAvailability,
      description: bookData.description || undefined
    };
  }
  
  /**
   * 書籍リストをエクスポートする
   * @param books 書籍リスト
   * @param path 出力先パス
   * @returns エクスポート結果
   */
  async export(books: BookList, path: string): Promise<Result<void>> {
    try {
      console.log(`${this.logPrefix}: ${books.type}リストをエクスポートします: ${path}`);
      
      // 書籍リストからCSVデータを生成
      const csvData = Array.from(books.items.values()).map(book => {
        // 図書館情報を変換
        const libraryInfo = {
          sophia_opac: "",
          utokyo_opac: "",
          exist_in_Sophia: "No",
          exist_in_UTokyo: "No",
          sophia_mathlib_opac: ""
        };
        
        // 上智大学
        const sophiaInfo = book.libraryAvailability.get("sophia" as LibraryId);
        if (sophiaInfo?.isAvailable) {
          libraryInfo.exist_in_Sophia = "Yes";
          libraryInfo.sophia_opac = sophiaInfo.opacUrl || "";
        }
        
        // 東京大学
        const utokyoInfo = book.libraryAvailability.get("utokyo" as LibraryId);
        if (utokyoInfo?.isAvailable) {
          libraryInfo.exist_in_UTokyo = "Yes";
          libraryInfo.utokyo_opac = utokyoInfo.opacUrl || "";
        }
        
        // 数学図書館
        const mathlibInfo = book.libraryAvailability.get("sophia-mathlib" as LibraryId);
        if (mathlibInfo?.isAvailable) {
          libraryInfo.sophia_mathlib_opac = mathlibInfo.opacUrl || "";
        }
        
        // CSVレコードを返す
        return {
          bookmeter_url: book.bookmeterUrl,
          isbn_or_asin: book.isbn.toString(),
          book_title: book.title,
          author: book.author,
          publisher: book.publisher,
          published_date: book.publishedDate,
          sophia_opac: libraryInfo.sophia_opac,
          utokyo_opac: libraryInfo.utokyo_opac,
          exist_in_Sophia: libraryInfo.exist_in_Sophia,
          exist_in_UTokyo: libraryInfo.exist_in_UTokyo,
          sophia_mathlib_opac: libraryInfo.sophia_mathlib_opac
        };
      });
      
      // ファイルにエクスポート
      await exportFile({
        fileName: path,
        payload: csvData,
        targetType: "csv",
        mode: "overwrite"
      });
      
      console.log(`${this.logPrefix}: ${csvData.length}冊の書籍をCSVファイルにエクスポートしました`);
      return success(undefined);
    } catch (error) {
      return this.wrapError(error, `${this.logPrefix}: 書籍リストのエクスポートに失敗しました`);
    }
  }
  
  /**
   * テーブル名をサニタイズする
   * @param name テーブル名
   * @returns サニタイズされたテーブル名
   * @private
   */
  private sanitizeTableName(name: string): string {
    if (/^\w+$/.test(name)) {
      return name;
    } else {
      throw new Error(`${this.logPrefix}: 無効なテーブル名: ${name}`);
    }
  }
}
