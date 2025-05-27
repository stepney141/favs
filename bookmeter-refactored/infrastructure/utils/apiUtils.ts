import { isAxiosError } from "axios";

import { sleep, randomWait, PromiseQueue, zip } from "../../../.libs/utils";

import type { AxiosError } from "axios";

import { ApiError } from "@/domain/models/errors";

/**
 * エラーログの簡略化
 */
export function logAxiosError(
  error: unknown,
  apiName: string,
  context?: string,
  logger?: { error: (message: string, context?: Record<string, unknown>) => void }
): void {
  const loggerFunction = logger?.error || console.error;

  if (isAxiosError(error)) {
    const axiosError = error as AxiosError;
    loggerFunction(
      `${apiName} APIエラー` +
        (context ? ` (${context})` : "") +
        `: ${axiosError.message}` +
        (axiosError.response ? ` [Status: ${axiosError.response.status}]` : "") +
        (axiosError.config?.url ? ` [URL: ${axiosError.config.url}]` : ""),
      { errorDetails: axiosError.message, status: axiosError.response?.status, url: axiosError.config?.url }
    );
  } else {
    const errorMessage = error instanceof Error ? error.message : String(error);
    loggerFunction(`${apiName} Unknown error: ${errorMessage}`, { errorDetails: errorMessage });
  }
}

/**
 * Axiosエラーを ApiError に変換する
 */
export function convertToApiError(error: unknown, apiName: string, endpoint: string): ApiError {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return new ApiError(axiosError.message, axiosError.response?.status, endpoint, axiosError);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ApiError(message, undefined, endpoint, error);
}

/**
 * URLにリダイレクトした先のURLを取得
 */
export async function getRedirectedUrl(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    return response.url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`リダイレクト先の取得に失敗しました: ${errorMessage}`);
    return undefined;
  }
}

// 既存のユーティリティ関数をエクスポート
export { sleep, randomWait, PromiseQueue, zip };
