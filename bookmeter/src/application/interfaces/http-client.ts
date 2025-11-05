import type { HttpError, Result } from "@/domain/error";

export type HttpRequestParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

export type HttpRequestConfig = {
  readonly headers?: Readonly<Record<string, string>>;
  readonly params?: HttpRequestParams;
  readonly responseType?: "json" | "text" | "arraybuffer";
  readonly timeoutMs?: number;
};

export type HttpResponse<T> = {
  readonly data: T;
  readonly status: number;
  readonly statusText: string;
};

export interface HttpClient {
  get<T>(url: string, config?: HttpRequestConfig): Promise<Result<HttpResponse<T>, HttpError>>;
}
