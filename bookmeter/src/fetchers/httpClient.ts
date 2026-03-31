/**
 * HTTP 通信を抽象化するインターフェースと Axios 実装。
 * 将来 fetch ベースの実装に差し替え可能。
 */

import axios from "axios";

import type { AxiosInstance, AxiosRequestConfig } from "axios";

export interface HttpClient {
  get<T>(url: string, options?: { headers?: Record<string, string>; responseType?: string }): Promise<T>;
  getWithStatus<T>(
    url: string,
    options?: { headers?: Record<string, string>; responseType?: string; validateStatus?: (status: number) => boolean }
  ): Promise<{ data: T; status: number }>;
  getRaw(url: string, options?: { headers?: Record<string, string>; responseType?: string }): Promise<Uint8Array>;
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
    }
  };
}
