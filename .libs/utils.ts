import fs from "node:fs/promises";
import { AxiosError } from "axios";
import { unparse } from "papaparse";
import type { ElementHandle, JSHandle, Page } from "puppeteer";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// see:
// - https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs
// - https://github.com/mozilla/pdf.js/issues/18006

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

export const mapToArray = <M extends Map<K, V>, K extends any, V extends any = object>(map: M): V[] => {
  const array: V[] = [];
  for (const elem of map.values()) {
    array.push(elem);
  }
  return array;
};

// 出力時：必ずarrayから変換してjsonかcsvに出力する
export type FileExportIO<T = any[]> = {
  payload: T;
  fileName: string;
  targetType: "json" | "csv";
  mode: "append" | "overwrite";
};

/**
 * @link https://zenn.dev/ptna/articles/63df4a8007f9d3
 */
export async function* extractTextFromPDF(pdfData: Uint8Array): AsyncGenerator<string> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  const maxPages = pdf.numPages;
  let pdfText = "";

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join("\n");
    pdfText += pageText + "\n";
    yield pageText;
  }
  return pdfText;
}

export const exportFile = async (IO: FileExportIO) => {
  const raw = IO.payload;
  let output: string = "";

  if (IO.targetType === "csv") {
    output = unparse(raw);
  } else if (IO.targetType === "json") {
    output = JSON.stringify(raw, null, "  ");
  }

  // ref: https://blog.katsubemakito.net/nodejs/file-write#%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E3%82%92%E9%96%8B%E3%81%8F%E9%9A%9B%E3%81%AE%E3%83%A2%E3%83%BC%E3%83%89%E4%B8%80%E8%A6%A7
  const fileFlag = IO.mode === "append" ? "a" : "w";
  const filehandle = await fs.open(IO.fileName, fileFlag);
  await filehandle.appendFile(output);
  await filehandle.close();
};
