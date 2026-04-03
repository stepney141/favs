/**
 * HTTP 通信を抽象化するインターフェースと Axios 実装。
 * 将来 fetch ベースの実装に差し替え可能。
 * getSafe / getWithStatusSafe は Result を返し、try-catch を HTTP 層に集約する。
 */

import axios from "axios";

import { fromPromise } from "../../../.libs/lib";

import { HttpError } from "./errors";

import type { FetcherSource } from "./errors";
import type { Result } from "../../../.libs/lib";
import type { AxiosInstance, AxiosRequestConfig } from "axios";

export type HttpClientOptions = {
  headers?: Record<string, string>;
  responseType?: string;
};

export type HttpClientStatusOptions = HttpClientOptions & {
  validateStatus?: (status: number) => boolean;
};

export interface HttpClient {
  get<T>(url: string, options?: HttpClientOptions): Promise<T>;
  getWithStatus<T>(url: string, options?: HttpClientStatusOptions): Promise<{ data: T; status: number }>;
  getRaw(url: string, options?: { headers?: Record<string, string> }): Promise<Uint8Array>;

  /** Result を返す get。try-catch 不要 */
  getSafe<T>(url: string, source: FetcherSource, options?: HttpClientOptions): Promise<Result<T, HttpError>>;
  /** Result を返す getWithStatus。try-catch 不要 */
  getWithStatusSafe<T>(
    url: string,
    source: FetcherSource,
    options?: HttpClientStatusOptions
  ): Promise<Result<{ data: T; status: number }, HttpError>>;
  /** Result を返す getRaw。try-catch 不要 */
  getRawSafe(
    url: string,
    source: FetcherSource,
    options?: { headers?: Record<string, string> }
  ): Promise<Result<Uint8Array, HttpError>>;
}

export function createAxiosHttpClient(): HttpClient {
  const instance: AxiosInstance = axios.create();

  return {
    async get<T>(url: string, options?: { headers?: Record<string, string>; responseType?: string }): Promise<T> {
      const config: AxiosRequestConfig = {
        url,
        method: "get",
        responseType: (options?.responseType as AxiosRequestConfig["responseType"]) ?? "json",
        headers: options?.headers
      };
      const response = await instance(config);
      return response.data as T;
    },

    async getWithStatus<T>(
      url: string,
      options?: {
        headers?: Record<string, string>;
        responseType?: string;
        validateStatus?: (status: number) => boolean;
      }
    ): Promise<{ data: T; status: number }> {
      const config: AxiosRequestConfig = {
        url,
        method: "get",
        responseType: (options?.responseType as AxiosRequestConfig["responseType"]) ?? "json",
        headers: options?.headers,
        validateStatus: options?.validateStatus
      };
      const response = await instance(config);
      return { data: response.data as T, status: response.status };
    },

    async getRaw(url: string, options?: { headers?: Record<string, string> }): Promise<Uint8Array> {
      const config: AxiosRequestConfig = {
        url,
        method: "get",
        responseType: "arraybuffer",
        headers: options?.headers
      };
      const response = await instance(config);
      return new Uint8Array(response.data);
    },

    async getSafe<T>(url: string, source: FetcherSource, options?: HttpClientOptions): Promise<Result<T, HttpError>> {
      return fromPromise(this.get<T>(url, options), (e) => toHttpError(e, source));
    },

    async getWithStatusSafe<T>(
      url: string,
      source: FetcherSource,
      options?: HttpClientStatusOptions
    ): Promise<Result<{ data: T; status: number }, HttpError>> {
      return fromPromise(this.getWithStatus<T>(url, options), (e) => toHttpError(e, source));
    },

    async getRawSafe(
      url: string,
      source: FetcherSource,
      options?: { headers?: Record<string, string> }
    ): Promise<Result<Uint8Array, HttpError>> {
      return fromPromise(this.getRaw(url, options), (e) => toHttpError(e, source));
    }
  };
}

function toHttpError(e: unknown, source: FetcherSource): HttpError {
  return new HttpError({ source }, { cause: e });
}
