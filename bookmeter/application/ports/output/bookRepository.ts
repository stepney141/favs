import type { Book, BookList } from '../../../domain/models/book';
import type { Either } from '../../../domain/models/either';

/**
 * 書籍リポジトリのエラー型
 */
export interface BookRepositoryError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * 書籍リポジトリインターフェース
 * 書籍情報の永続化を担当する
 */
export interface BookRepository {
  /**
   * 書籍リストを取得する
   * @param type 'wish'または'stacked'
   * @returns 取得結果のEither型
   */
  getBookList(type: 'wish' | 'stacked'): Promise<Either<BookRepositoryError, BookList>>;
  
  /**
   * 書籍リストを保存する
   * @param bookList 保存する書籍リスト
   * @returns 保存結果のEither型
   */
  saveBookList(bookList: BookList): Promise<Either<BookRepositoryError, void>>;
  
  /**
   * 単一の書籍を取得する
   * @param isbn ISBN
   * @param type 'wish'または'stacked'
   * @returns 取得結果のEither型
   */
  getBook(isbn: string, type: 'wish' | 'stacked'): Promise<Either<BookRepositoryError, Book | null>>;
  
  /**
   * 単一の書籍を保存する
   * @param book 保存する書籍
   * @param type 'wish'または'stacked'
   * @returns 保存結果のEither型
   */
  saveBook(book: Book, type: 'wish' | 'stacked'): Promise<Either<BookRepositoryError, void>>;
  
  /**
   * 書籍を削除する
   * @param isbn 削除する書籍のISBN
   * @param type 'wish'または'stacked'
   * @returns 削除結果のEither型
   */
  deleteBook(isbn: string, type: 'wish' | 'stacked'): Promise<Either<BookRepositoryError, void>>;
  
  /**
   * 書籍リストをCSVファイルにエクスポートする
   * @param bookList エクスポートする書籍リスト
   * @param filePath エクスポート先のファイルパス
   * @returns エクスポート結果のEither型
   */
  exportToCsv(bookList: BookList, filePath: string): Promise<Either<BookRepositoryError, void>>;
  
  /**
   * CSVファイルから書籍リストをインポートする
   * @param filePath インポート元のファイルパス
   * @param type 'wish'または'stacked'
   * @returns インポート結果のEither型
   */
  importFromCsv(filePath: string, type: 'wish' | 'stacked'): Promise<Either<BookRepositoryError, BookList>>;
  
  /**
   * データベースを初期化する
   * @returns 初期化結果のEither型
   */
  initializeDatabase(): Promise<Either<BookRepositoryError, void>>;
  
  /**
   * 書籍の説明文を更新する（kinokuniyaクローラー用）
   * @param isbn ISBN
   * @param description 説明文
   * @param type 'wish'または'stacked'
   * @returns 更新結果のEither型
   */
  updateDescription(isbn: string, description: string, type: 'wish' | 'stacked'): Promise<Either<BookRepositoryError, void>>;
  
  /**
   * データベースをバックアップする
   * @param backupPath バックアップ先のパス
   * @returns バックアップ結果のEither型
   */
  backupDatabase?(backupPath: string): Promise<Either<BookRepositoryError, void>>;
  
  /**
   * データベースを復元する
   * @param backupPath 復元元のパス
   * @returns 復元結果のEither型
   */
  restoreDatabase?(backupPath: string): Promise<Either<BookRepositoryError, void>>;
}
