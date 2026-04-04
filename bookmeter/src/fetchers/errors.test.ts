import { describe, expect, it } from "vitest";

import { HttpError, httpToFetcherError } from "./errors";
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
