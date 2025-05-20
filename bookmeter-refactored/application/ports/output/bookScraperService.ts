import type { Book, BookList } from "@/domain/models/book";
import type { ScrapingError } from "@/domain/models/errors";
import type { Result } from "@/domain/models/result";

/**
 * 書籍スクレイパーのポート
 * Bookmeterウェブサイトから書籍情報を取得するスクレイピング処理を担当
 */
export interface BookScraperService {
  /**
   * 「読みたい本」リストを取得
   * @param userId ユーザーID
   * @param isSignedIn ログインするかどうか（trueの場合ログイン、falseの場合はログインなし）
   * @param signal AbortSignal（キャンセル用）
   * @returns 読みたい本のリスト
   */
  getWishBooks(userId: string, isSignedIn?: boolean, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>>;

  /**
   * 「積読本」リストを取得
   * @param userId ユーザーID
   * @param signal AbortSignal（キャンセル用）
   * @returns 積読本のリスト
   */
  getStackedBooks(userId: string, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>>;

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
        mode: "wish" | "stacked";
      };
    }
  ): Promise<Result<ScrapingError, Book>>;
}
