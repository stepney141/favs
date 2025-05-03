import type { Book, BookList } from '../../../domain/models/book';
import type { ScrapingError } from '../../../domain/models/errors';
import type { Result } from '../../../domain/models/result';
import type { ISBN10 } from '../../../domain/models/valueObjects';


/**
 * 書籍スクレイパーのポート
 * bookmeterウェブサイトから書籍情報を取得するスクレイピング処理を担当
 */
export interface BookScraperService {
  /**
   * 「読みたい本」リストを取得
   * @param userId ユーザーID
   * @param signal AbortSignal（キャンセル用）
   * @returns 読みたい本のリスト
   */
  getWishBooks(userId: string, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>>;
  
  /**
   * 「積読本」リストを取得
   * @param userId ユーザーID
   * @param signal AbortSignal（キャンセル用）
   * @returns 積読本のリスト
   */
  getStackedBooks(userId: string, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>>;
  
  /**
   * 紀伊國屋書店から書籍の説明を取得
   * @param isbn 書籍のISBN10
   * @returns 書籍の説明文
   */
  scrapeBookDescription(isbn: ISBN10): Promise<Result<ScrapingError, string>>;
  
  /**
   * 書籍をログイン状態でスキャンし、詳細情報を取得
   * @param bookUrl BookmeterのURL
   * @param options オプション（登録など）
   * @returns 書籍の詳細情報
   */
  scanBookWithLogin(
    bookUrl: string, 
    options?: {
      register?: {
        mode: 'wish' | 'stacked'
      }
    }
  ): Promise<Result<ScrapingError, Book>>;
}
