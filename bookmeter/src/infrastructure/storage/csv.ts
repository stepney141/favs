import fs from "node:fs/promises";

import { parse } from "papaparse";

import type { Book } from "@/domain/entities/book";
import type { ParseResult } from "papaparse";

export const DEFAULT_CSV_FILENAME = {
  wish: "./csv/bookmeter_wish_books.csv",
  stacked: "./csv/bookmeter_stacked_books.csv"
};

/**
 * CSVエクスポート時に含めるカラム
 */
export const CSV_EXPORT_COLUMNS = {
  wish: [
    "bookmeter_url",
    "isbn_or_asin",
    "book_title",
    "author",
    "publisher",
    "published_date",
    "exist_in_sophia",
    "exist_in_uTokyo",
    "sophia_opac",
    "utokyo_opac",
    "sophia_mathlib_opac"
  ],
  stacked: [
    "bookmeter_url",
    "isbn_or_asin",
    "book_title",
    "author",
    "publisher",
    "published_date"
    // stackedでは所蔵情報は不要と仮定
  ]
} as const;

export type OutputFilePath = {
  wish: string;
  stacked: string;
};

export const buildCsvFileName = (userId: string, filePath: OutputFilePath | null = null): OutputFilePath => {
  if (filePath === null) {
    if (userId === BOOKMETER_DEFAULT_USER_ID) return DEFAULT_CSV_FILENAME;
    return {
      wish: `./csv/${userId}_bookmeter_wish_books.csv`,
      stacked: `./csv/${userId}_bookmeter_stacked_books.csv`
    };
  } else {
    return filePath;
  }
};

export const readBookListCSV = async (filename: string) => {
  /* ref: 
  - https://garafu.blogspot.com/2017/06/nodejs-exists-directory.html
  - https://nodejs.org/docs/latest/api/fs.html#fs_fs_access_path_mode_callback
  >> Do not use fs.access() to check for the accessibility of a file before calling fs.open(), fs.readFile(), or fs.writeFile().
  >> Doing so introduces a race condition, since other processes may change the file's state between the two calls.
  >> Instead, user code should open/read/write the file directly and handle the error raised if the file is not accessible.
  */
  try {
    await fs.access(filename);
  } catch {
    return null;
  }

  const data = await fs.readFile(filename, "utf-8");
  const parsedObj = parse(data, {
    header: true,
    complete: (results: ParseResult<Book>) => results
  });
  return parsedObj.data;
};

/**
 * 前回の書籍リストをCSVから読み出し、Mapにデシリアライズする
 * 後方互換性のために保持
 */
export const getPrevBookListFromCsv = async (filename: string): Promise<BookList | null> => {
  const csv = await readBookListCSV(filename);
  if (csv === null) return null;

  const prevList: BookList = new Map();
  for (const obj of csv) {
    if (obj["bookmeter_url"] === "") continue;
    prevList.set(obj["bookmeter_url"], { ...obj });
  }
  return prevList;
};
