import type { BookList, BookListType } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors";
import type { Result } from "@/domain/models/result";

/**
 * ストレージサービスのポート
 * ファイルの入出力やクラウドストレージとのやり取りを担当
 */
export interface StorageService {
  /**
   * 書籍リストをCSVファイルにエクスポート
   * @param books 書籍リスト
   * @param filePath 出力先ファイルパス
   * @param columns 出力するカラム名の配列（オプション）
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  exportToCsv(books: BookList, filePath: string, columns?: readonly string[]): Promise<Result<string, AppError>>;

  /**
   * データベースに保存された書籍リストをCSVにエクスポート
   * @param type 書籍リストのタイプ（wish または stacked）
   * @param filePath 出力先ファイルパス
   * @param options 追加のオプション（columns: 出力するカラム名の配列）
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  exportBookList(
    type: BookListType,
    filePath?: string,
    options?: { columns?: string[] } & Record<string, unknown>
  ): Promise<Result<string, AppError>>;

  /**
   * SQLiteデータベースファイルをクラウドストレージにアップロード
   * @param options アップロードオプション
   * @returns 成功時はvoid、失敗時はエラー
   */
  uploadDatabaseToCloud(options?: { dbFilePath?: string; targetPath?: string }): Promise<Result<void, AppError>>;

  /**
   * CSVファイルを読み込んで書籍リストを取得
   * @param filePath CSVファイルのパス
   * @returns 書籍リスト
   */
  importFromCsv(filePath: string): Promise<Result<BookList, AppError>>;

  /**
   * ファイルが存在するかどうかを確認
   * @param filePath ファイルパス
   * @returns ファイルが存在するかどうか
   */
  fileExists(filePath: string): Promise<Result<boolean, AppError>>;

  /**
   * テキストファイルのURL一覧を読み込む
   * @param filePath ファイルパス
   * @returns URL文字列の配列
   */
  readUrlList(filePath: string): Promise<Result<string[], AppError>>;
}
