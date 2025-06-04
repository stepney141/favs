import type { CrawlBookDescriptionParams } from "@/application/usecases/crawlBookDescriptionUseCase";
import type { SaveBookListParams } from "@/application/usecases/saveBookListUseCase";
import type { BookList, BookListType } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors";
import type { Result } from "@/domain/models/result";

// 各ユースケースの型定義
export interface GetBookListParams {
  readonly userId: string;
  readonly type: BookListType;
  readonly source: "remote" | "local";
  readonly processing: "smart" | "force" | "skip";
  readonly outputFilePath?: string | null;
  readonly signal?: AbortSignal;
}

// 書籍リストの取得結果
export interface BookListResult {
  readonly books: BookList;
  readonly hasChanges: boolean;
}

export interface GetBookListUseCase {
  execute: (params: Readonly<GetBookListParams>) => Promise<Result<BookListResult, AppError>>;
}

export interface FetchBiblioInfoUseCase {
  execute: (books: Readonly<BookList>, signal?: AbortSignal) => Promise<BookList>;
}

export interface SaveBookListUseCase {
  execute: (params: Readonly<SaveBookListParams>) => Promise<Result<void, AppError>>;
}

export interface CrawlBookDescriptionUseCase {
  execute: (params: Readonly<CrawlBookDescriptionParams>) => Promise<Result<void, AppError>>;
}
