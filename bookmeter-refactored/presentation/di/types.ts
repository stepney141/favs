import type { CrawlBookDescriptionParams } from "@/application/usecases/crawlBookDescriptionUseCase"; // 追加
import type { SaveBookListParams } from "@/application/usecases/saveBookListUseCase";
import type { BookList, BookListType } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors"; // 追加
import type { Result } from "@/domain/models/result"; // 追加

/**
 * 依存性注入で使用するシンボル
 */
export const TYPES = {
  // インフラストラクチャ
  Logger: "Logger",
  BookRepository: "BookRepository",
  BookScraperService: "BookScraperService",
  BiblioInfoProvider: "BiblioInfoProvider",
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
  type: BookListType;
  userId?: string;
  refresh?: boolean; // 追加
  skipRemoteCheck?: boolean;
  skipComparison?: boolean;
  outputFilePath?: string | null;
}

// 書籍リストの取得結果
export interface BookListResult {
  books: BookList;
  hasChanges: boolean;
}

export interface GetBookListUseCase {
  execute: (params: GetBookListParams) => Promise<Result<AppError, BookListResult>>; // 戻り値の型を変更
}

export interface FetchBiblioInfoUseCase {
  // シグネチャを実装に合わせる
  execute: (books: BookList, signal?: AbortSignal) => Promise<BookList>;
}

export interface SaveBookListUseCase {
  // 引数と戻り値の型を実装に合わせる
  execute: (params: SaveBookListParams) => Promise<Result<AppError, void>>;
}

export interface CrawlBookDescriptionUseCase {
  // 引数と戻り値の型を実装に合わせる
  execute: (params: CrawlBookDescriptionParams) => Promise<Result<AppError, void>>;
}
