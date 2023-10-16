export interface crawler {
  login: () => void;
  crawl: () => void;
  print: () => void;
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
export const Err = (payload): ErrorResult => {
  return { type: "error", payload };
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

