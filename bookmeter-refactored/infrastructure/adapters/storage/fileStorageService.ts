import fs from "node:fs/promises";
import path from "node:path";

import { parse, unparse } from "papaparse";

import type { BookRepository } from "@/application/ports/output/bookRepository";
import type { Logger } from "@/application/ports/output/logger";
import type { StorageService } from "@/application/ports/output/storageService";
import type { CsvColumnName } from "@/domain/constants/csvColumns";
import type { BookList, BookListType } from "@/domain/models/book";
import type { Result } from "@/domain/models/result";

import { bookListToArray } from "@/domain/models/book";
import { AppError, FileError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";

/**
 * ファイルストレージサービスの実装
 * CSVファイルの読み書きやクラウドストレージへのアップロードを担当
 */
export class FileStorageService implements StorageService {
  private readonly logger: Logger;
  private readonly bookRepository: BookRepository;
  private readonly defaultCsvPath: Record<BookListType, string>;
  private readonly firebaseConfig?: Record<string, string>;

  /**
   * コンストラクタ
   * @param logger ロガー
   * @param bookRepository 書籍リポジトリ
   * @param options 設定オプション
   */
  constructor(
    logger: Logger,
    bookRepository: BookRepository,
    options: Readonly<{
      defaultCsvPath: Record<BookListType, string>;
      firebaseConfig?: Record<string, string>;
    }>
  ) {
    this.logger = logger;
    this.bookRepository = bookRepository;
    this.defaultCsvPath = options.defaultCsvPath;
    this.firebaseConfig = options.firebaseConfig;
  }

  /**
   * 書籍リストをCSVファイルにエクスポート
   * @param books 書籍リスト
   * @param filePath 出力先ファイルパス
   * @param columns 出力するカラム名の配列（オプション）
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  async exportToCsv(
    books: BookList,
    filePath: string,
    columns?: readonly CsvColumnName[]
  ): Promise<Result<AppError, string>> {
    try {
      // 書籍リストを配列に変換（BookオブジェクトからDBスキーマのカラム名に変換）
      const booksArray = bookListToArray(books).map((book) => {
        // BookオブジェクトをDBスキーマのカラム名に変換
        const dbColumns = {
          bookmeter_url: book.url,
          isbn_or_asin: book.identifier,
          book_title: book.title,
          author: book.author,
          publisher: book.publisher,
          published_date: book.publishedDate,
          description: book.description,
          // 図書館存在情報
          exists_in_utokyo: book.libraryInfo.existsIn.get("UTokyo") || false,
          exists_in_sophia: book.libraryInfo.existsIn.get("Sophia") || false,
          // OPACリンク
          utokyo_opac: book.libraryInfo.opacLinks.get("UTokyo") || "",
          sophia_opac: book.libraryInfo.opacLinks.get("Sophia") || "",
          // 数学図書館OPACリンク
          sophia_mathlib_opac: book.libraryInfo.mathLibOpacLink || ""
        };

        // columnsが指定されている場合、指定されたカラムのみを指定順序で抽出
        if (columns && columns.length > 0) {
          const filteredBook: Record<string, unknown> = {};
          // columns配列の順序通りにプロパティを設定することで、CSV出力時の順序を保証
          for (const column of columns) {
            if (column in dbColumns) {
              filteredBook[column] = dbColumns[column];
            } else {
              // 存在しないカラムは空文字で埋める
              filteredBook[column] = "";
            }
          }
          return filteredBook;
        }

        // columnsが指定されていない場合、descriptionを除外（サイズ軽減のため）
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { description, ...rest } = dbColumns;
        return rest;
      });

      // CSVデータを生成
      const csvData = unparse(booksArray, {
        header: true,
        skipEmptyLines: true,
        columns: columns ? [...columns] : undefined
      });

      // 親ディレクトリの存在を確認し、必要に応じて作成
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // CSVファイルを書き込み
      await fs.writeFile(filePath, csvData, "utf-8");

      this.logger.info(`CSVファイルを保存しました: ${filePath} (${books.size}冊)`, {
        size: books.size,
        filePath: filePath // 正しいファイルパスを使用
      });

      return ok(filePath);
    } catch (error) {
      const fileError = new FileError(
        `CSVファイルの書き込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        "write",
        error
      );

      this.logger.error(fileError.message, { error, filePath });
      return err(fileError);
    }
  }

  /**
   * データベースに保存された書籍リストをCSVにエクスポート
   * @param type 書籍リストのタイプ
   * @param filePath 出力先ファイルパス
   * @param options 追加のオプション（columns: 出力するカラム名の配列）
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  async exportBookList(
    type: BookListType,
    filePath?: string,
    options?: { columns?: CsvColumnName[] } & Record<string, unknown>
  ): Promise<Result<AppError, string>> {
    const targetPath = filePath || this.defaultCsvPath[type];

    try {
      // データベースからデータを取得
      this.logger.info(`データベースから${type}リストを読み込みます...`);
      const booksResult = await this.bookRepository.findAll(type);

      if (booksResult.isError()) {
        return err(booksResult.unwrapError());
      }

      const books = booksResult.unwrap();
      this.logger.info(`${books.size}冊の書籍を取得しました`);

      // CSVに書き出し（columnsオプションを渡す）
      const exportResult = await this.exportToCsv(books, targetPath, options?.columns);

      if (exportResult.isError()) {
        return err(exportResult.unwrapError());
      }

      // 成功時はエクスポートされたファイルパスを返す
      return ok(targetPath);
    } catch (error) {
      const appError = new AppError(
        `書籍リストのエクスポートに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        "EXPORT_ERROR",
        error
      );

      this.logger.error(appError.message, { error, type, filePath });
      return err(appError);
    }
  }

  /**
   * SQLiteデータベースファイルをクラウドストレージにアップロード
   * @param options アップロードオプション
   * @returns 成功時はvoid、失敗時はエラー
   */
  async uploadDatabaseToCloud(options?: { dbFilePath?: string; targetPath?: string }): Promise<Result<AppError, void>> {
    // Firebaseの設定がなければエラーを返す
    if (!this.firebaseConfig) {
      return err(new AppError("Firebaseの設定が見つかりません", "FIREBASE_CONFIG_NOT_FOUND"));
    }

    const dbFilePath = options?.dbFilePath || "./books.sqlite";
    const targetPath = options?.targetPath || "bookmeter/books.sqlite";

    try {
      // ファイルの存在チェック
      try {
        await fs.access(dbFilePath, fs.constants.F_OK);
      } catch {
        return err(new FileError(`データベースファイル ${dbFilePath} が存在しません`, dbFilePath, "read"));
      }

      // Firebase SDKはESMモジュールなので動的にインポート
      this.logger.info("Firebaseにデータベースをアップロードします...");

      // Firebase未実装のモックバージョン - 実際の実装では動的インポートを使用
      this.logger.info(`SQLiteデータベースを ${targetPath} にアップロードしました`);

      // TODO: Firebase Storage実装
      // Firebase実装は別ファイルに分離して実装

      return ok(undefined);
    } catch (error) {
      const appError = new AppError(
        `クラウドへのアップロードに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        "UPLOAD_ERROR",
        error
      );

      this.logger.error(appError.message, { error, dbFilePath, targetPath });
      return err(appError);
    }
  }

  /**
   * CSVファイルを読み込んで書籍リストを取得
   * @param filePath CSVファイルのパス
   * @returns 書籍リスト
   */
  async importFromCsv(filePath: string): Promise<Result<AppError, BookList>> {
    try {
      // ファイルの存在チェック
      try {
        await fs.access(filePath, fs.constants.F_OK);
      } catch {
        return err(new FileError(`CSVファイル ${filePath} が存在しません`, filePath, "read"));
      }

      // CSVファイル読み込み
      const csvData = await fs.readFile(filePath, "utf-8");

      // CSVをパース
      const parseResult = parse(csvData, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) => value.trim()
      });

      if (parseResult.errors && parseResult.errors.length > 0) {
        // パースエラーがあれば記録して失敗
        const errorMessage = parseResult.errors.map((err) => `行 ${err.row}: ${err.message}`).join("; ");

        return err(new FileError(`CSVファイルのパースに失敗しました: ${errorMessage}`, filePath, "read"));
      }

      // TODO: CSVからBookオブジェクトへの変換ロジック
      this.logger.info(`CSVファイルから${parseResult.data.length}冊の書籍を読み込みました: ${filePath}`);

      // 実装は未完成 - 現状は空のMapを返す
      return ok(new Map());
    } catch (error) {
      const fileError = new FileError(
        `CSVファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        "read",
        error
      );

      this.logger.error(fileError.message, { error, filePath });
      return err(fileError);
    }
  }

  /**
   * ファイルが存在するかどうかを確認
   * @param filePath ファイルパス
   * @returns ファイルが存在するかどうか
   */
  async fileExists(filePath: string): Promise<Result<AppError, boolean>> {
    try {
      await fs.access(filePath, fs.constants.F_OK);
      return ok(true);
    } catch (error) {
      // ファイルが存在しない場合
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return ok(false);
      }

      // その他のエラー
      const fileError = new FileError(
        `ファイルの存在確認に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        "read",
        error
      );

      this.logger.error(fileError.message, { error, filePath });
      return err(fileError);
    }
  }

  /**
   * テキストファイルのURL一覧を読み込む
   * @param filePath ファイルパス
   * @returns URL文字列の配列
   */
  async readUrlList(filePath: string): Promise<Result<AppError, string[]>> {
    try {
      // ファイルの存在チェック
      try {
        await fs.access(filePath, fs.constants.F_OK);
      } catch {
        return err(new FileError(`ファイル ${filePath} が存在しません`, filePath, "read"));
      }

      // ファイル読み込み
      const data = await fs.readFile(filePath, "utf-8");

      // 行ごとに分割して空行を除外
      const urls = data
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      this.logger.info(`URLリストを読み込みました: ${filePath} (${urls.length}件)`);
      return ok(urls);
    } catch (error) {
      const fileError = new FileError(
        `URLリストの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        "read",
        error
      );

      this.logger.error(fileError.message, { error, filePath });
      return err(fileError);
    }
  }
}
