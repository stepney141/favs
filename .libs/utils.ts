import { AxiosError } from "axios";
import type { ElementHandle, JSHandle, Page } from "puppeteer";

export const handleAxiosError = (error: AxiosError) => {
  if (error.response) {
    console.log({
      status: error.response.status,
      error: error.response.data,
      errorMsg: error.message
    });
  } else {
    console.log({
      errorMsg: error.message,
      request: error.request
    });
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
 * @link https://zenn.dev/sora_kumo/articles/539d7f6e7f3c63
 */
export const PromiseQueue = (ps = new Set<Promise<unknown>>()) => ({
  add: (p: Promise<unknown>) => {
    p.then(() => ps.delete(p)).catch(() => ps.delete(p));
    ps.add(p);
  },
  wait: (limit: number) => ps.size >= limit && Promise.race(ps),
  all: () => Promise.all(ps)
});

/**
 * @link https://jappy.hatenablog.com/entry/2020/01/29/082932
 */
export const sliceByNumber = <T = object>(array: T[], n: number): T[][] =>
  array.reduce((acc: T[][], c, i: number) => (i % n ? acc : [...acc, ...[array.slice(i, i + n)]]), []);

/**
 * Iterates like Python-zip
 * @param  {...any} args
 * @link https://qiita.com/__sil/items/d7a83d4072ae47ad404c
 * @link https://dev.to/chrismilson/zip-iterator-in-typescript-ldm
 * @example
   const array1 = ['apple', 'orange', 'grape'];
   const array2 = ['rabbit', 'dog', 'cat'];
   const array3 = ['car', 'bicycle', 'airplane'];
   for (let [elm1, elm2, elm3] of zip(array1, array2, array3)) {
       console.log(elm1, elm2, elm3);
   }
 */
export function* zip<T extends Array<any>>(...args: Iterableify<T>): Generator<T> {
  const iterators = args.map((it) => it[Symbol.iterator]());
  while (true) {
    const results = iterators.map((i) => i.next());
    if (results.some(({ done }) => done)) {
      break;
    }
    yield results.map(({ value }) => value) as T;
  }
}
type Iterableify<T> = { [K in keyof T]: Iterable<T[K]> };

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
