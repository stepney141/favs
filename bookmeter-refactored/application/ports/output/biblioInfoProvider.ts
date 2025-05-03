import type { Book } from '../../../domain/models/book';
import type { ApiError } from '../../../domain/models/errors';
import type { Result } from '../../../domain/models/result';
import type { BookIdentifier, BiblioInfoSource } from '../../../domain/models/valueObjects';


/**
 * 書誌情報プロバイダーのポート
 * 外部APIから書籍の書誌情報を取得する処理を担当
 */
export interface BiblioInfoProvider {
  /**
   * このプロバイダーのソース名を取得
   * @returns プロバイダーのソース名
   */
  getSourceName(): BiblioInfoSource;
  
  /**
   * 書籍の識別子（ISBN/ASIN）から書誌情報を取得
   * @param identifier 書籍識別子（ISBN/ASIN）
   * @returns 書誌情報が含まれた書籍オブジェクト
   */
  fetchBookInfo(identifier: BookIdentifier): Promise<Result<ApiError, Book>>;
  
  /**
   * 書籍オブジェクトに書誌情報を追加・更新
   * @param book 更新対象の書籍
   * @returns 書誌情報が更新された書籍
   */
  enhanceBook(book: Book): Promise<Result<ApiError, Book>>;
  
  /**
   * このプロバイダーが指定された書籍識別子をサポートしているかチェック
   * @param identifier 書籍識別子（ISBN/ASIN）
   * @returns サポートしている場合はtrue
   */
  supportsIdentifier(identifier: BookIdentifier): boolean;
  
  /**
   * このプロバイダーの優先度を取得
   * 優先度が高いほど先に処理される
   * @param identifier 書籍識別子（ISBN/ASIN）
   * @returns 優先度（数値が大きいほど優先度が高い）
   */
  getPriority(identifier: BookIdentifier): number;
}
