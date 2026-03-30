export type Result<T, E extends Error> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  readonly err?: null | undefined;
}

export interface Err<E extends Error> {
  readonly ok: false;
  readonly value?: null | undefined;
  readonly err: E;
}

export function isOk<T, E extends Error>(result: Result<T, E>): result is Extract<Result<T, E>, { ok: true }> {
  return result.ok === true;
}

export function isErr<T, E extends Error>(result: Result<T, E>): result is Extract<Result<T, E>, { ok: false }> {
  return result.ok === false;
}

export function Ok<T>(value: T): Ok<T> {
  return { ok: true, err: null, value };
}

export function Err<E extends Error>(err: E): Err<E> {
  return { ok: false, value: null, err };
}

export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  const { value, ok } = result;
  if (ok === true) {
    return value;
  } else {
    throw result.err;
  }
}

export type AppError =
  | ApiError
  | BookNotFoundError
  | InvalidIsbnError
  | ConfigError
  | HttpError
  | ScrapeError
  | LoginError
  | NetworkError;

export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ApiError extends BaseError {
  constructor(message: string) {
    super(`API Access Error: ${message}`);
  }
}

export class BookNotFoundError extends BaseError {
  constructor(identifier: string) {
    super(`Book not found: ${identifier}`);
  }
}

export class InvalidIsbnError extends BaseError {
  constructor(isbn: string) {
    super(`Invalid ISBN: ${isbn}`);
  }
}

export class ConfigError extends BaseError {
  constructor(message: string) {
    super(`Configuration Error: ${message}`);
  }
}

export type HttpErrorContext = {
  readonly message: string;
  readonly url: string;
  readonly status: number;
};

export class HttpError extends BaseError {
  constructor(context: HttpErrorContext) {
    super(`HTTP Error: ${context.message} (Status: ${context.status}) for ${context.url}`);
  }
}

export class ScrapeError extends BaseError {
  constructor(
    message: string,
    public readonly url?: string
  ) {
    super(`Scraping Error: ${message}${url ? ` (URL: ${url})` : ""}`);
  }
}

export class LoginError extends BaseError {
  constructor(message: string) {
    super(`Login Error: ${message}`);
  }
}

export class NetworkError extends BaseError {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(`Network Error: ${message}`);
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}
