import axios from "axios";

import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

export interface HttpClient {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}

export class AxiosHttpClient implements HttpClient {
  private readonly client: AxiosInstance;

  constructor(config?: AxiosRequestConfig) {
    this.client = axios.create(config);
  }

  get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }
}
