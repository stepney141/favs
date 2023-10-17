import { AxiosError, isAxiosError } from "axios";
import type { ElementHandle, JSHandle } from "puppeteer";

/**
 * @link https://gist.github.com/fgilio/230ccd514e9381fafa51608fcf137253
 */
export const handleAxiosError = (error: AxiosError) => {
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    console.log(error.request);
  } else {
    console.log("Error", error);
  }
};

/**
 * @link https://qiita.com/albno273/items/c2d48fdcbf3a9a3434db
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

/**
 * Iterates like Python-zip
 * @param  {...any} args
 * @link https://python.ms/javascript--zip/
 * @example
 * const array1 = ['apple', 'orange', 'grape'];
   const array2 = ['rabbit', 'dog', 'cat'];
   const array3 = ['car', 'bicycle', 'airplane'];
   for (let [elm1, elm2, elm3] of zip(array1, array2, array3)) {
       console.log(elm1, elm2, elm3);
   }
 */
export function* zip<T extends any>(...args: T[][]): Generator<T[]> {
  const length = args[0].length;

  // 引数チェック
  for (const arr of args) {
    if (arr.length !== length) {
      throw "Lengths of arrays are not the same.";
    }
  }

  // イテレート
  for (let index = 0; index < length; index++) {
    const elms: T[] = [];
    for (const arr of args) {
      elms.push(arr[index]);
    }
    yield elms;
  }
}

export const getNodeProperty = async <T>(eh: ElementHandle, prop: string): Promise<T> => {
  const handle = (await eh.getProperty(prop)) as JSHandle<T>;
  const value = await handle.jsonValue();

  return value;
};

export const writeFile = (filename: string) => {};

export const readFile = (filename: string) => {};
