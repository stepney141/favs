import { AxiosError } from "axios";
import type { ElementHandle, JSHandle, Page } from "puppeteer";

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
  console.log("Axios threw the above error!");
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
 * @link https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
 */
export const transposeArray = <T>(a: T[][]): T[][] => a[0].map((_, c) => a.map((r) => r[c]));

export const clickMouse = async (page: Page, x: number, y: number, time: number): Promise<boolean> => {
  try {
    await Promise.all([page.mouse.move(x, y), page.waitForTimeout(time), page.mouse.click(x, y)]);
    return true;
  } catch (e) {
    console.log(e);
    return false;
  }
};

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
export function* zip<T extends any[]>(...args: T[]): Generator<T> {
  const length = args[0].length;

  // 引数チェック
  for (const arr of args) {
    if (arr.length !== length) {
      throw "Lengths of arrays are not the same.";
    }
  }

  // イテレート
  for (let index = 0; index < length; index++) {
    const elms = [] as unknown as T;
    for (const arr of args) {
      elms.push(arr[index]);
    }
    yield elms;
  }
}

export const getNodeProperty = async <T>(eh: ElementHandle<Node>, prop: string): Promise<T> => {
  const handle = (await eh.getProperty(prop)) as JSHandle<T>;
  const value = await handle.jsonValue();

  return value;
};

export const mapToArray = <K extends any, V extends any, M extends Map<K, V>>(map: M): V[] => {
  const array: V[] = [];
  for (const elem of map.values()) {
    array.push(elem);
  }
  return array;
};

type FileIO<T extends any> = {
  payload: T;
  filename: string;
  filetype: "json" | "csv";
};

export const writeFile = (IO: FileIO<string>) => {};
export const appendFile = (IO: FileIO<string>) => {};
export const readFile = (IO: FileIO<string>) => {};
