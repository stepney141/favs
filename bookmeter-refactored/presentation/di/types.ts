import type { CrawlBookDescriptionParams } from "@/application/usecases/crawlBookDescriptionUseCase"; // 追加
import type { SaveBookListParams } from "@/application/usecases/saveBookListUseCase";
import type { BookList, BookListType } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors"; // 追加
import type { Result } from "@/domain/models/result"; // 追加

/**
 * API認証情報
 */
export interface APICredentials {
  isbndb: string;
  google: string;
  cinii?: string;
}

/**
 * 依存性注入で使用するシンボル
 */
export const TYPES = {
  // インフラストラクチャ
  Logger: "Logger",
  BookRepository: "BookRepository",
  BookScraperService: "BookScraperService",
  BookContentScraperService: "BookContentScraperService",
  BiblioInfoProvider: "BiblioInfoProvider",
  BiblioInfoManager: "BiblioInfoManager",
  APICredentials: "APICredentials",
  StorageService: "StorageService",
  DataDirectory: "DataDirectory", // データディレクトリパス

  // ユースケース
  GetBookListUseCase: "GetBookListUseCase",
  FetchBiblioInfoUseCase: "FetchBiblioInfoUseCase",
  SaveBookListUseCase: "SaveBookListUseCase",
  CrawlBookDescriptionUseCase: "CrawlBookDescriptionUseCase"
} as const;

// 型の安全性のために、有効なキーの型を定義
export type DependencyKey = (typeof TYPES)[keyof typeof TYPES];

// 各ユースケースの型定義
export interface GetBookListParams {
  readonly userId: string;
  readonly type: BookListType;
  readonly source: "remote" | "local";
  readonly processing: "smart" | "force" | "skip";
  readonly outputFilePath?: string | null;
  readonly signal?: AbortSignal; // ユースケース側の定義に合わせる
}

// 書籍リストの取得結果
export interface BookListResult {
  readonly books: BookList;
  readonly hasChanges: boolean;
}

export interface GetBookListUseCase {
  execute: (params: Readonly<GetBookListParams>) => Promise<Result<AppError, BookListResult>>; // 戻り値の型を変更
}

export interface FetchBiblioInfoUseCase {
  execute: (books: Readonly<BookList>, signal?: AbortSignal) => Promise<BookList>;
}

export interface SaveBookListUseCase {
  execute: (params: Readonly<SaveBookListParams>) => Promise<Result<AppError, void>>;
}

export interface CrawlBookDescriptionUseCase {
  execute: (params: Readonly<CrawlBookDescriptionParams>) => Promise<Result<AppError, void>>;
}
