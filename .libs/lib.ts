import type { Browser } from "puppeteer";

export interface Crawler<T> {
  browser: Browser;
  fetchedData: T;

  login(): this;
  explore(): Promise<T>;
}

/**
 * Result-Type to handle errors
 * @link https://zenn.dev/uhyo/articles/ts-4-6-destructing-unions
 * @link https://yatsbashy.hatenablog.com/entry/typescript-simple-result
 * @link https://interrupt.co.jp/blog/entry/2021/04/17/073733
 */
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

export function Ok<T>(value: T): Ok<T> {
  return { ok: true, err: null, value };
}

export function Err<E extends Error>(err: E): Err<E> {
  return { ok: false, value: null, err };
}

export function isOk<T, E extends Error>(result: Result<T, E>): result is Extract<Result<T, E>, { ok: true }> {
  return result.ok === true;
}

export function isErr<T, E extends Error>(result: Result<T, E>): result is Extract<Result<T, E>, { ok: false }> {
  return result.ok === false;
}

export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  const { value, ok } = result;
  if (ok === true) {
    return value;
  } else {
    throw result.err;
  }
}

/** Ok の値を変換する */
export const mapResult = <T, U, E extends Error>(result: Result<T, E>, fn: (val: T) => U): Result<U, E> => {
  if (result.ok) {
    return Ok(fn(result.value));
  } else {
    return result;
  }
};

/** エラー値を変換する */
export const mapResultErr = <T, E extends Error, F extends Error>(
  result: Result<T, E>,
  fn: (err: E) => F
): Result<T, F> => {
  if (!result.ok) {
    return Err(fn(result.err));
  } else {
    return result;
  }
};

/** Promise を Result に変換する（try-catch の代替） */
export const fromPromise = async <T, E extends Error>(
  promise: Promise<T>,
  errorFn: (e: unknown) => E
): Promise<Result<T, E>> => {
  try {
    const value = await promise;
    return Ok(value);
  } catch (error) {
    return Err(errorFn(error));
  }
};

export class BaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export type Brand<K, T> = K & { __brand: T };
