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

type ParsedTimeoutDetails = {
  attemptedAddress?: string;
  timeoutMs?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const getNestedCause = (error: unknown): unknown => {
  return isRecord(error) ? error["cause"] : undefined;
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRecord(error) && typeof error["message"] === "string") {
    return error["message"];
  }
  return undefined;
};

const getErrorCode = (error: unknown): string | undefined => {
  if (isRecord(error) && typeof error["code"] === "string") {
    return error["code"];
  }
  const cause = getNestedCause(error);
  if (cause !== undefined) {
    return getErrorCode(cause);
  }
  return undefined;
};

const parseTimeoutDetails = (message: string): ParsedTimeoutDetails => {
  const attemptedAddress = message.match(/attempted address: ([^,)]+)/)?.[1];
  const timeoutMs = message.match(/timeout: (\d+)ms/)?.[1];

  return {
    attemptedAddress,
    timeoutMs: timeoutMs === undefined ? undefined : Number(timeoutMs)
  };
};

export function formatErrorForLog(error: unknown): string {
  const errorCode = getErrorCode(error);
  const message = getErrorMessage(error);
  const cause = getNestedCause(error);
  const causeMessage = getErrorMessage(cause);

  if (errorCode === "UND_ERR_CONNECT_TIMEOUT") {
    const details = parseTimeoutDetails(causeMessage ?? message ?? "");
    const parts = [
      "接続がタイムアウトしました",
      details.attemptedAddress === undefined ? undefined : `接続先: ${details.attemptedAddress}`,
      details.timeoutMs === undefined ? undefined : `タイムアウト: ${details.timeoutMs}ms`,
      `コード: ${errorCode}`
    ].filter((part): part is string => part !== undefined);

    return parts.join(" / ");
  }

  if (causeMessage !== undefined && message !== undefined && causeMessage !== message) {
    return `${message} (原因: ${causeMessage})`;
  }

  if (message !== undefined) {
    return message;
  }

  return String(error);
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
    {
      type: httpErr.context.status === undefined ? "networkError" : "apiError",
      source: httpErr.context.source,
      status: httpErr.context.status
    },
    { cause: httpErr }
  );
}

/** エラーログ出力用のヘルパー */
export function logFetcherError(error: unknown, operationName: string, context?: string, consequence?: string): void {
  const consequenceMessage = consequence === undefined ? "" : `。${consequence}`;
  console.error(
    `${operationName} でエラーが発生しました${context ? ` (${context})` : ""}: ${formatErrorForLog(error)}${consequenceMessage}`
  );
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
