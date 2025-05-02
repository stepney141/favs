import type { Book, BookList } from '../../../domain/models/book';
import type { Either } from '../../../domain/models/either';
import type { UserId } from '../../../domain/models/valueObjects';

/**
 * 書籍スクレイパーのエラー型
 */
export interface BookScraperError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * ブラウザセッションのインターフェース
 */
export interface BrowserSession {
  /**
   * ブラウザを初期化する
   */
  initialize(): Promise<Either<BookScraperError, void>>;
  
  /**
   * 指定URLに移動する
   * @param url 移動先URL
   */
  navigateTo(url: string): Promise<Either<BookScraperError, void>>;
  
  /**
   * セレクタに一致する要素にクリックする
   * @param selector セレクタ
   */
  click(selector: string): Promise<Either<BookScraperError, void>>;
  
  /**
   * セレクタに一致する要素に文字列を入力する
   * @param selector セレクタ
   * @param text 入力テキスト
   */
  type(selector: string, text: string): Promise<Either<BookScraperError, void>>;
  
  /**
   * JavaScriptを実行する
   * @param script 実行するスクリプト
   * @returns 実行結果
   */
  evaluate<T>(script: string): Promise<Either<BookScraperError, T>>;
  
  /**
   * セレクタに一致する要素の属性を取得する
   * @param selector セレクタ
   * @param attributeName 属性名
   * @returns 属性値
   */
  getAttribute(selector: string, attributeName: string): Promise<Either<BookScraperError, string>>;
  
  /**
   * セレクタに一致する要素のテキスト内容を取得する
   * @param selector セレクタ
   * @returns テキスト内容
   */
  getText(selector: string): Promise<Either<BookScraperError, string>>;
  
  /**
   * ブラウザを閉じる
   */
  close(): Promise<Either<BookScraperError, void>>;
}

/**
 * 書籍スクレイパーサービスのインターフェース
 */
export interface BookScraperService {
  /**
   * 読みたい本リストを取得する
   * @param userId ユーザーID
   * @returns 処理結果
   */
  getWishBooks(userId: UserId): Promise<Either<BookScraperError, BookList>>;
  
  /**
   * 積読本リストを取得する
   * @param userId ユーザーID
   * @returns 処理結果
   */
  getStackedBooks(userId: UserId): Promise<Either<BookScraperError, BookList>>;
  
  /**
   * 特定の書籍情報を取得する
   * @param bookmeterUrl ブクメーターの書籍URL
   * @returns 処理結果
   */
  getBookDetails?(bookmeterUrl: string): Promise<Either<BookScraperError, Book>>;
  
  /**
   * ログイン状態にする
   * @param username ユーザー名
   * @param password パスワード
   * @returns 処理結果
   */
  login?(username: string, password: string): Promise<Either<BookScraperError, void>>;
  
  /**
   * 初期化
   * @returns 処理結果
   */
  initialize?(): Promise<Either<BookScraperError, void>>;
  
  /**
   * 後処理を行う
   * @returns 処理結果
   */
  dispose?(): Promise<Either<BookScraperError, void>>;
}
