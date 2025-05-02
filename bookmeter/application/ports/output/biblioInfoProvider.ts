import type { Book } from '../../../domain/models/book';
import type { BiblioinfoErrorStatus, Result } from '../../../domain/models/valueObjects';

/**
 * 書誌情報プロバイダーインターフェース
 * 外部APIから書籍の詳細情報を取得するための抽象化
 */
export interface BiblioInfoProvider {
  /**
   * プロバイダーの名前
   */
  readonly name: string;
  
  /**
   * 指定したISBNの書籍の詳細情報を取得する
   * @param isbn ISBN
   * @returns 取得結果
   */
  fetchInfoByIsbn(isbn: string): Promise<Result<Partial<Book>, BiblioinfoErrorStatus>>;
  
  /**
   * 書籍情報を補完する
   * @param book 補完対象の書籍
   * @returns 補完された書籍情報
   */
  enrichBook(book: Book): Promise<Result<Book, BiblioinfoErrorStatus>>;
}

/**
 * 複数の書誌情報プロバイダーを組み合わせて利用するための集約インターフェース
 */
export interface BiblioInfoProviderAggregator {
  /**
   * 登録されているプロバイダーの一覧を取得
   * @returns プロバイダーの配列
   */
  getProviders(): BiblioInfoProvider[];
  
  /**
   * 指定したISBNの書籍の詳細情報を取得する
   * 複数のプロバイダーを順に試し、最初に成功したプロバイダーの結果を返す
   * @param isbn ISBN
   * @returns 取得結果
   */
  fetchInfoByIsbn(isbn: string): Promise<Result<Partial<Book>, BiblioinfoErrorStatus>>;
  
  /**
   * 書籍情報を複数のプロバイダーを使って補完する
   * 各プロバイダーの結果をマージして、できるだけ完全な書籍情報を構築する
   * @param book 補完対象の書籍
   * @returns 補完された書籍情報
   */
  enrichBook(book: Book): Promise<Result<Book, BiblioinfoErrorStatus>>;
}
