import type { Book } from '../../../domain/models/book';
import type { Either } from '../../../domain/models/either';

/**
 * 書誌情報プロバイダのエラー型
 */
export interface BiblioInfoError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * 書誌情報プロバイダインターフェース
 * 単一の情報ソース（例: OpenBD API）から書籍情報を取得する
 */
export interface BiblioInfoProvider {
  /**
   * プロバイダ名
   */
  readonly name: string;
  
  /**
   * 書籍の情報を充実させる
   * @param book 書籍情報
   * @returns 充実した書籍情報のEither型
   */
  enrichBook(book: Book): Promise<Either<BiblioInfoError, Book>>;
  
  /**
   * 複数の書籍の情報を一括で充実させる
   * @param books 書籍情報の配列
   * @returns 充実した書籍情報の配列のEither型
   */
  enrichBooks?(books: readonly Book[]): Promise<Either<BiblioInfoError, readonly Book[]>>;
}

/**
 * 複数の書誌情報プロバイダを集約するアグリゲータ
 */
export interface BiblioInfoProviderAggregator {
  /**
   * 複数のプロバイダを使って書籍情報を充実させる
   * @param book 書籍情報
   * @param apiKeys 必要に応じてAPIキー
   * @returns 充実した書籍情報のEither型
   */
  enrichBook(book: Book, apiKeys?: Record<string, string>): Promise<Either<BiblioInfoError, Book>>;
  
  /**
   * 複数の書籍を一括で充実させる
   * @param books 書籍情報の配列
   * @param apiKeys 必要に応じてAPIキー
   * @returns 充実した書籍情報の配列のEither型
   */
  enrichBooks(books: readonly Book[], apiKeys?: Record<string, string>): Promise<Either<BiblioInfoError, readonly Book[]>>;
  
  /**
   * プロバイダを登録する
   * @param provider 書誌情報プロバイダ
   */
  registerProvider(provider: BiblioInfoProvider): void;
}
