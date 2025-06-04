import type { BiblioInfoSource, Book, BookList } from "@/domain/models/book";
import type { ApiError } from "@/domain/models/errors";
import type { BookIdentifier } from "@/domain/models/isbn";
import type { Result } from "@/domain/models/result";

/**
 * 書籍情報取得関数の型
 */
export type BookInfoFetcher = (identifier: BookIdentifier) => Promise<Result<Book, ApiError>>;

/**
 * 一括書籍情報取得関数の型
 */
export type BulkBookInfoFetcher = (identifiers: BookIdentifier[]) => Promise<Result<Map<string, Book>, ApiError>>;

/**
 * プロバイダー設定
 */
export interface ProviderConfig {
  readonly name: BiblioInfoSource;
  readonly supportsIdentifier: (id: BookIdentifier) => boolean;
}

/**
 * 単一プロバイダー
 */
export interface SingleProvider {
  readonly config: ProviderConfig;
  readonly fetchSingle: BookInfoFetcher;
}

/**
 * 一括取得対応プロバイダー
 */
export interface BulkProvider extends SingleProvider {
  readonly fetchBulk: BulkBookInfoFetcher;
}

/**
 * プロバイダーコレクション
 */
export interface ProviderCollection {
  readonly openBD?: BulkProvider;
  readonly individual: SingleProvider[];
}

/**
 * 書籍情報サービス
 */
export interface BiblioInfoService {
  readonly fetchBiblioInfo: (bookList: BookList, signal?: AbortSignal) => Promise<BookList>;
}

/**
 * API認証情報
 */
export interface APICredentials {
  isbndb: string;
  google: string;
  cinii?: string;
}

/**
 * 書籍検索結果
 */
export interface BookSearchResult {
  book: Book;
  isFound: boolean;
}
