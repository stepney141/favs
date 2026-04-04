/**
 * fetchers モジュールで使用するエラー型定義。
 * レイヤー単位の Error クラス + context.type で細分化する。
 */

import { BaseError } from "../../../.libs/lib";

import type { BiblioinfoErrorStatus } from "./types";

export type FetcherSource = "OpenBD" | "ISBNdb" | "NDL" | "GoogleBooks" | "CiNii";

export type FetcherErrorContext =
  | { type: "notFound"; source: FetcherSource }
  | { type: "apiError"; source: FetcherSource; status?: number }
  | { type: "networkError"; source: FetcherSource; status?: number }
  | { type: "invalidIsbn" };

const formatStatusCode = (status?: number): string => {
  return status === undefined ? "" : ` (HTTP status code: ${status})`;
};

const toFetcherErrorMessage = (context: FetcherErrorContext): string => {
  switch (context.type) {
    case "notFound":
      return `Fetcher error [${context.type}] from ${context.source}`;
    case "apiError":
    case "networkError":
      return `Fetcher error [${context.type}] from ${context.source}${formatStatusCode(context.status)}`;
    case "invalidIsbn":
      return "Fetcher error [invalidIsbn]";
  }
};

export class FetcherError extends BaseError {
  constructor(
    public readonly context: FetcherErrorContext,
    options?: { cause?: unknown }
  ) {
    super(toFetcherErrorMessage(context), options);
  }
}

export class HttpError extends BaseError {
  constructor(
    public readonly context: { source: FetcherSource; status?: number },
    options?: { cause?: unknown }
  ) {
    super(`HTTP error from ${context.source}${formatStatusCode(context.status)}`, options);
  }
}

/** FetcherError を既存の BiblioinfoErrorStatus 文字列に変換する */
export const toErrorStatus = (error: FetcherError): BiblioinfoErrorStatus => {
  switch (error.context.type) {
    case "notFound":
      return `Not_found_in_${error.context.source}`;
    case "apiError":
      return `${error.context.source}_API_Error` as BiblioinfoErrorStatus;
    case "networkError":
      return `${error.context.source}_API_Error` as BiblioinfoErrorStatus;
    case "invalidIsbn":
      return "INVALID_ISBN";
  }
};

/** HttpError → FetcherError 変換 */
export function httpToFetcherError(httpErr: HttpError): FetcherError {
  return new FetcherError(
    { type: "apiError", source: httpErr.context.source, status: httpErr.context.status },
    { cause: httpErr }
  );
}

/** エラーログ出力用のヘルパー */
export function logFetcherError(error: unknown, apiName: string, context?: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const jobName = "Bookmeter Wished Books";
  console.error(`${jobName}: ${apiName} APIエラー` + (context ? ` (${context})` : "") + `: ${errorMessage}`);
}

/** FetcherError をログ出力する */
export function logFetcherResultError(error: FetcherError, context?: string): void {
  switch (error.context.type) {
    case "invalidIsbn":
      logFetcherError(error, "Validation", context);
      break;
    case "notFound":
      logFetcherError(error, error.context.source, context);
      break;
    case "apiError":
    case "networkError":
      logFetcherError(error.cause ?? error, error.context.source, context);
      break;
  }
}
