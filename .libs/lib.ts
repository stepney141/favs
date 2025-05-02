import type { Browser } from "puppeteer";

// type CrawlState<T> = Initial<T> | Prepared<T> | LoggedIn<T>;
// type Initial<T> = {
//   status: "Initial";
//   payload?: T;
//   isPrepared: false;
//   isLoggedIn: false;
// };
// type Prepared<T> = {
//   status: "Prepared";
//   payload?: T;
//   isPrepared: true;
//   isLoggedIn: false;
// };
// type LoggedIn<T> = {
//   status: "LoggedIn";
//   payload?: T;
//   isPrepared: true;
//   isLoggedIn: true;
// };
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
export type Result<T> = OkResult<T> | ErrorResult;
export type OkResult<T> = {
  type: "ok";
  payload: T;
};
export type ErrorResult = {
  type: "error";
  payload: Error;
};
export const Ok = <T>(payload: T): OkResult<T> => {
  return { type: "ok", payload };
};
export const Err = (payload: Error): ErrorResult => {
  return { type: "error", payload };
};
export const isOk = <T>(result: Result<T>): result is OkResult<T> => {
  if (result.type === "ok") {
    return true;
  } else {
    return false;
  }
};
export const isErr = <T>(result: Result<T>): result is ErrorResult => {
  if (result.type === "error") {
    return true;
  } else {
    return false;
  }
};
export const unwrapResult = <T>(result: Result<T>): T => {
  // payload はここでは T | Error 型
  const { type, payload } = result;
  if (type === "ok") {
    // payload はこの中では T 型
    return payload;
  } else {
    throw payload;
  }
};

export type Brand<K, T> = K & { __brand: T };
