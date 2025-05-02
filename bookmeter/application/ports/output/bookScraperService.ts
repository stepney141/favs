import type { BookList } from '../../../domain/models/book';
import type { Result, UserId } from '../../../domain/models/valueObjects';

/**
 * 書籍スクレイパーサービスインターフェース
 * ウェブサイトから書籍情報をスクレイピングするための抽象化
 */
export interface BookScraperService {
  /**
   * ログイン状態かどうか
   */
  readonly isLoggedIn: boolean;
  
  /**
   * スクレイパーの初期化
   * @returns 初期化結果
   */
  initialize(): Promise<Result<void>>;
  
  /**
   * ウェブサイトにログインする
   * @param username ユーザー名
   * @param password パスワード
   * @returns ログイン結果
   */
  login(username: string, password: string): Promise<Result<void>>;
  
  /**
   * 読みたい本リストを取得する
   * @param userId ユーザーID
   * @returns 取得結果
   */
  getWishBooks(userId: UserId): Promise<Result<BookList>>;
  
  /**
   * 積読本リストを取得する
   * @param userId ユーザーID
   * @returns 取得結果
   */
  getStackedBooks(userId: UserId): Promise<Result<BookList>>;
  
  /**
   * スクレイパーのリソースを解放する
   * @returns 解放結果
   */
  dispose(): Promise<Result<void>>;
}

/**
 * ブラウザセッション管理インターフェース
 * Puppeteerなどのブラウザ自動操作ライブラリを抽象化
 */
export interface BrowserSession {
  /**
   * ブラウザを初期化する
   * @returns 初期化結果
   */
  initialize(): Promise<Result<void>>;
  
  /**
   * 指定したURLにナビゲートする
   * @param url 移動先URL
   * @returns ナビゲーション結果
   */
  navigateTo(url: string): Promise<Result<void>>;
  
  /**
   * 指定したセレクタの要素をクリックする
   * @param selector 要素のセレクタ
   * @returns クリック結果
   */
  click(selector: string): Promise<Result<void>>;
  
  /**
   * 指定したセレクタの要素にテキストを入力する
   * @param selector 要素のセレクタ
   * @param text 入力するテキスト
   * @returns 入力結果
   */
  type(selector: string, text: string): Promise<Result<void>>;
  
  /**
   * 指定したセレクタの要素のテキストを取得する
   * @param selector 要素のセレクタ
   * @returns テキスト取得結果
   */
  getText(selector: string): Promise<Result<string>>;
  
  /**
   * 指定したセレクタの要素のHTML属性を取得する
   * @param selector 要素のセレクタ
   * @param attributeName 属性名
   * @returns 属性値取得結果
   */
  getAttribute(selector: string, attributeName: string): Promise<Result<string | null>>;
  
  /**
   * 指定したXPathの要素を取得する
   * @param xpath XPath式
   * @returns 要素取得結果
   */
  getElementByXPath(xpath: string): Promise<Result<unknown>>;
  
  /**
   * 指定したXPathの要素のテキストを取得する
   * @param xpath XPath式
   * @returns テキスト取得結果
   */
  getTextByXPath(xpath: string): Promise<Result<string>>;
  
  /**
   * 指定したXPathの要素の属性を取得する
   * @param xpath XPath式
   * @param attributeName 属性名
   * @returns 属性値取得結果
   */
  getAttributeByXPath(xpath: string, attributeName: string): Promise<Result<string | null>>;
  
  /**
   * ページ上でJavaScriptを実行する
   * @param script 実行するスクリプト
   * @returns 実行結果
   */
  evaluate<T>(script: string | ((...args: unknown[]) => T)): Promise<Result<T>>;
  
  /**
   * セッションを終了する
   * @returns 終了結果
   */
  close(): Promise<Result<void>>;
}
