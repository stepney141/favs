import type { Result, AppError } from "@/domain/error";
import type { BookCollectionMode, BookRepository } from "@/domain/repositories/bookRepository";

/**
 * スクレイピング時のオプション
 */
export type ScrapeOptions = {
  requireLogin: boolean;
};

/**
 * 書籍コレクションをスクレイピングするためのインターフェース
 */
export interface BookCollectionScraper {
  scrape(mode: BookCollectionMode, options: ScrapeOptions): Promise<Result<BookRepository, AppError>>;
}

/**
 * Bookmeterのベース URI
 */
export const BOOKMETER_BASE_URI = "https://bookmeter.com";

/**
 * 書籍リストのスナップショットを保存するストア
 */
export interface BookListSnapshotStore {
  save(data: unknown): Promise<void>;
  load(): Promise<unknown>;
}

/**
 * 書籍リストのモード
 */
export type BookListMode = "wish" | "stacked";

/**
 * CSVエクスポーター
 */
export interface CsvExporter {
  export(data: unknown, filename: string): Promise<void>;
}
