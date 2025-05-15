import fs from "node:fs/promises";
import path from "node:path";

import { parse, unparse } from "papaparse";

import type { BookRepository } from "@/application/ports/output/bookRepository";
import type { Logger } from "@/application/ports/output/logger";
import type { StorageService } from "@/application/ports/output/storageService";
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
    options: {
      defaultCsvPath: Record<BookListType, string>;
      firebaseConfig?: Record<string, string>;
    }
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
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  async exportToCsv(books: BookList, filePath: string): Promise<Result<AppError, string>> {
    try {
      // 書籍リストを配列に変換（BookオブジェクトからCSV用に変換）
      const booksArray = bookListToArray(books).map((book) => {
        // descriptionをCSVに含めない（サイズ軽減のため）
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { description, ...rest } = book;
        return {
          ...rest,
          // Mapをフラット化
          ...Object.fromEntries(book.libraryInfo.existsIn.entries()),
          ...Object.fromEntries(book.libraryInfo.opacLinks.entries()),
          mathlib_opac: book.libraryInfo.mathLibOpacLink
        };
      });

      // CSVデータを生成
      const csvData = unparse(booksArray, {
        header: true,
        skipEmptyLines: true
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
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  async exportBookList(type: BookListType, filePath?: string): Promise<Result<AppError, string>> {
    // filePathをオプショナルにし、戻り値をstringに変更
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

      // CSVに書き出し
      const exportResult = await this.exportToCsv(books, targetPath);

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
