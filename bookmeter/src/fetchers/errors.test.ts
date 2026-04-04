import { describe, expect, it } from "vitest";

import { formatErrorForLog, HttpError, httpToFetcherError } from "./errors";
import { toHttpError } from "./httpClient";

describe("HttpError", () => {
  it("includes the HTTP status code in the message when available", () => {
    const error = new HttpError({ source: "OpenBD", status: 429 });

    expect(error.message).toBe("HTTP error from OpenBD (HTTP status code: 429)");
  });
});

describe("httpToFetcherError", () => {
  it("preserves the HTTP status code in the fetcher error message", () => {
    const fetcherError = httpToFetcherError(new HttpError({ source: "NDL", status: 503 }));

    expect(fetcherError.context).toEqual({ type: "apiError", source: "NDL", status: 503 });
    expect(fetcherError.message).toBe("Fetcher error [apiError] from NDL (HTTP status code: 503)");
  });

  it("maps missing HTTP status to a network error", () => {
    const fetcherError = httpToFetcherError(new HttpError({ source: "CiNii" }));

    expect(fetcherError.context).toEqual({ type: "networkError", source: "CiNii", status: undefined });
    expect(fetcherError.message).toBe("Fetcher error [networkError] from CiNii");
  });
});

describe("toHttpError", () => {
  it("extracts the HTTP status code from an Axios-style error", () => {
    const axiosLikeError = {
      isAxiosError: true,
      message: "Request failed with status code 404",
      response: { status: 404 }
    };

    const httpError = toHttpError(axiosLikeError, "GoogleBooks");

    expect(httpError.context).toEqual({ source: "GoogleBooks", status: 404 });
    expect(httpError.cause).toBe(axiosLikeError);
  });
});

describe("formatErrorForLog", () => {
  it("formats undici connection timeouts with address and timeout", () => {
    const timeoutError = new TypeError("fetch failed", {
      cause: {
        code: "UND_ERR_CONNECT_TIMEOUT",
        message: "Connect Timeout Error (attempted address: www.lib.sophia.ac.jp:443, timeout: 10000ms)"
      }
    });

    expect(formatErrorForLog(timeoutError)).toBe(
      "接続がタイムアウトしました / 接続先: www.lib.sophia.ac.jp:443 / タイムアウト: 10000ms / コード: UND_ERR_CONNECT_TIMEOUT"
    );
  });
});
