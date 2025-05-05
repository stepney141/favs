import type { BookList, BookListType } from "../../domain/models/book";

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
  execute: (params: GetBookListParams) => Promise<BookListResult>;
}

export interface FetchBiblioInfoUseCase {
  execute: (books: BookList) => Promise<BookList>;
}

export interface SaveBookListUseCase {
  execute: (books: BookList, type: BookListType, outputFilePath?: string | null) => Promise<void>;
}

export interface CrawlBookDescriptionUseCase {
  execute: (books: BookList, type: BookListType) => Promise<void>;
}
