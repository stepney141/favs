import type { HttpClient } from "./interfaces/http-client";
import type { Book } from "../domain/entities/book";
import type { ApiCredentials } from "@/config/config";
import type { CiniiTarget, CiniiTargetOrgs } from "@/domain/book-sources";
import type { AppError, Result } from "@/domain/error";

// 図書館の所蔵情報の取得ユースケース
export type LibraryHoldingsLookupper = (
  command: LibraryHoldingsLookupCommand
) => Result<LibraryHoldingsLookupResult, AppError>;
export type AsyncLibraryHoldingsLookupper = (
  command: LibraryHoldingsLookupCommand
) => Promise<Result<LibraryHoldingsLookupResult, AppError>>;

export type LibraryLookupStatus = Readonly<Record<CiniiTargetOrgs, boolean | null>>;

export interface LibraryHoldingsLookupCommand {
  readonly kind: "Pending" | "Found" | "Not_found";
  readonly input: {
    readonly book: Book;
    readonly credentials: ApiCredentials;
    readonly targetLibrary: CiniiTarget;
    readonly lookupStatus: LibraryLookupStatus; // 図書館が当該図書を所蔵しているかどうか (検索未実施ならnull)
    readonly dataSource?: Set<string>;
  };
  readonly dependencies: {
    readonly httpClient: HttpClient;
  };
}

export type LibraryHoldingsLookupResult = {
  readonly book: Book;
  readonly lookupStatus: LibraryLookupStatus; // 図書館が当該図書を所蔵しているかどうか (検索未実施ならnull)
};
