import axios, { isAxiosError } from "axios";

import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

import { type HttpClient, type HttpRequestConfig, type HttpResponse } from "@/application/ports/http-client";
import { Err, HttpError, Ok } from "@/domain/error";

/**
 * Axiosはstatus codeが4xx, 5xxなら勝手にthrow Errorする
 * throwする条件をvalidateStatusで指定できる (falseならthrowする)
 * @link https://axios-http.com/docs/handling_errors
 */
const DEFAULT_VALIDATE_STATUS = (status: number): boolean => (status >= 200 && status < 300) || status === 404;
export const neverThrowValidateStatus = (status: number): boolean => true;

const toAxiosConfig = (config?: HttpRequestConfig): AxiosRequestConfig => {
  if (config === undefined) {
    return {};
  }

  const axiosConfig: AxiosRequestConfig = {};

  if (config.headers !== undefined) {
    axiosConfig.headers = { ...config.headers };
  }
  if (config.params !== undefined) {
    axiosConfig.params = config.params;
  }
  if (config.responseType !== undefined) {
    axiosConfig.responseType = config.responseType;
  }
  if (config.timeoutMs !== undefined) {
    axiosConfig.timeout = config.timeoutMs;
  }

  return axiosConfig;
};

const toHttpResponse = <T>(response: AxiosResponse<T>): HttpResponse<T> => ({
  data: response.data,
  status: response.status,
  statusText: response.statusText
});

export function createAxiosHttpClient(config?: AxiosRequestConfig): HttpClient {
  const mergedConfig: AxiosRequestConfig = {
    ...config,
    validateStatus: config?.validateStatus ?? DEFAULT_VALIDATE_STATUS
  };
  const client: AxiosInstance = axios.create(mergedConfig);

  return {
    get: async <T>(url: string, requestConfig?: HttpRequestConfig) => {
      try {
        const response = await client.get<T>(url, toAxiosConfig(requestConfig));
        return Ok(toHttpResponse(response));
      } catch (error) {
        if (isAxiosError(error)) {
          const status = error.response?.status ?? 0;
          const message = error.message ?? "HTTP request failed";
          const requestUrl = error.config?.url ?? url;
          return Err(new HttpError({ message, status, url: requestUrl }));
        }

        const fallbackMessage = error instanceof Error ? error.message : String(error);
        return Err(new HttpError({ message: fallbackMessage, status: 0, url }));
      }
    }
  };
}
