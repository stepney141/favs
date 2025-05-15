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
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  exportToCsv(books: BookList, filePath: string): Promise<Result<AppError, string>>;

  /**
   * データベースに保存された書籍リストをCSVにエクスポート
   * @param type 書籍リストのタイプ（wish または stacked）
   * @param filePath 出力先ファイルパス
   * @param options 追加のオプション
   * @returns 成功時はファイルパス、失敗時はエラー
   */
  exportBookList(
    type: BookListType,
    filePath?: string, // filePathをオプショナルに変更
    options?: Record<string, unknown>
  ): Promise<Result<AppError, string>>; // 戻り値をstringに変更

  /**
   * SQLiteデータベースファイルをクラウドストレージにアップロード
   * @param options アップロードオプション
   * @returns 成功時はvoid、失敗時はエラー
   */
  uploadDatabaseToCloud(options?: { dbFilePath?: string; targetPath?: string }): Promise<Result<AppError, void>>;

  /**
   * CSVファイルを読み込んで書籍リストを取得
   * @param filePath CSVファイルのパス
   * @returns 書籍リスト
   */
  importFromCsv(filePath: string): Promise<Result<AppError, BookList>>;

  /**
   * ファイルが存在するかどうかを確認
   * @param filePath ファイルパス
   * @returns ファイルが存在するかどうか
   */
  fileExists(filePath: string): Promise<Result<AppError, boolean>>;

  /**
   * テキストファイルのURL一覧を読み込む
   * @param filePath ファイルパス
   * @returns URL文字列の配列
   */
  readUrlList(filePath: string): Promise<Result<AppError, string[]>>;
}
