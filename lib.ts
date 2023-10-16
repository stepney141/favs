import { isAxiosError } from "axios";

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

export const handleAxiosError = (error: unknown) => {
  if (isAxiosError(error)) {
    // ref: https://gist.github.com/fgilio/230ccd514e9381fafa51608fcf137253
    if (error.response) {
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else if (error.request) {
      console.log(error.request);
    } else {
      console.log("Error", error);
    }
  }
};

/**
 * ref: https://qiita.com/albno273/items/c2d48fdcbf3a9a3434db
 * @example
 * await sleep(randomWait(1000, 0.5, 1.1));
 * // 1000ms x0.5 ~ x1.1 の間でランダムにアクセスの間隔を空ける
 */
export const sleep = async (time: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, time);
  });

export const randomWait = (baseWaitSeconds: number, min: number, max: number): number =>
  baseWaitSeconds * (Math.random() * (max - min) + min);
