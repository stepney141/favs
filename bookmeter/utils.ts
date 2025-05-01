import * as fsSync from "node:fs";
import fs from "node:fs/promises";

import { parse } from "papaparse";

import { BOOKMETER_DEFAULT_USER_ID, DEFAULT_CSV_FILENAME, JOB_NAME, REGEX } from "./constants";
import { loadBookListFromDatabase } from "./sqlite";

import type { ASIN, Book, BookList, ISBN10, ISBN13, OutputFilePath } from "./types";
import type { ParseResult } from "papaparse";

export const isIsbn10 = (str: ISBN10 | ISBN13 | ASIN): boolean => {
  return str.match(REGEX.isbn10) !== null;
};
export const isIsbn13 = (str: ISBN10 | ISBN13 | ASIN): boolean => {
  return str.match(REGEX.isbn13) !== null;
};

/**
 * @link https://qiita.com/iz-j/items/27b9656ebed1a4516ee1
 */
export const convertISBN10To13 = (isbn10: ISBN10): ISBN13 => {
  // 1. 先頭に`978`を足して、末尾の1桁を除く
  const src = `978${isbn10.slice(0, 9)}`;

  // 2. 先頭の桁から順に1、3、1、3…を掛けて合計する
  const sum = src
    .split("")
    .map((s) => parseInt(s))
    .reduce((p, c, i) => p + (i % 2 === 0 ? c : c * 3));

  // 3. 合計を10で割った余りを10から引く（※引き算の結果が10の時は0とする）
  const rem = 10 - (sum % 10);
  const checkdigit = rem === 10 ? 0 : rem;

  const result = `${src}${checkdigit}`;

  // 1.の末尾に3.の値を添えて出来上がり
  return result as ISBN13;
};

export const isAsin = (str: ISBN10 | ASIN): boolean => {
  if (isIsbn10(str)) {
    return false;
  }
  return str.match(REGEX.amazon_asin) !== null;
};

/**
 * Amazonへのリンクに含まれるASIN(ISBN含む)を抽出
 */
export const matchASIN = (url: string): string | null => {
  const matched = url.match(REGEX.amazon_asin);
  return matched?.[0] ?? null;
};

/**
 * OPACのリダイレクトURLを取得
 * @example 
 input: https://www.lib.sophia.ac.jp/opac/opac_openurl/?isbn=1000000000 //invalid
 => https://www.lib.sophia.ac.jp/opac/opac_search/?direct=1&ou_srh=1&amode=2&lang=0&isbn=1000000000
 input: https://www.lib.sophia.ac.jp/opac/opac_openurl/?isbn=4326000481 //valid
 => https://www.lib.sophia.ac.jp/opac/opac_details/?lang=0&opkey=B170611882191096&srvce=0&amode=11&bibid=1003102195
 */
export const getRedirectedUrl = async (targetUrl: string): Promise<string | undefined> => {
  try {
    const response = await fetch(targetUrl, {
      redirect: "follow"
    });
    return response.url;
  } catch (error) {
    console.log(error);
    return undefined;
  }
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
 * bookmeter urlのリストを配列にデシリアライズする
 */
export const readUrlList = async (filename: string): Promise<string[] | null> => {
  try {
    await fs.access(filename);
  } catch {
    return null;
  }

  const data = await fs.readFile(filename, "utf-8");
  return data.split("\n").filter((line) => line !== "");
};

/**
 * 前回の書籍リストをSQLiteデータベースから読み出す。
 * データベースが存在しない場合は従来通りCSVから読み出す。
 */
export const getPrevBookList = async (filename: string): Promise<BookList | null> => {
  try {
    // CSVファイル名からモード（wish/stacked）を推測
    let tableName: string;
    if (filename.includes("wish")) {
      tableName = "wish";
    } else if (filename.includes("stacked")) {
      tableName = "stacked";
    } else {
      console.warn(`${JOB_NAME}: Could not determine table name from filename ${filename}, falling back to CSV`);
      return getPrevBookListFromCsv(filename);
    }

    // データベースファイルが存在するか確認
    if (fsSync.existsSync("./books.sqlite")) {
      console.log(`${JOB_NAME}: Loading previous book list from SQLite database (table: ${tableName})`);
      try {
        const bookList = await loadBookListFromDatabase(tableName);
        if (bookList.size > 0) {
          return bookList;
        } else {
          console.log(`${JOB_NAME}: SQLite table ${tableName} exists but is empty, falling back to CSV`);
          return getPrevBookListFromCsv(filename);
        }
      } catch (error) {
        console.error(`${JOB_NAME}: Error loading from SQLite:`, error);
        console.log(`${JOB_NAME}: Falling back to CSV file`);
        return getPrevBookListFromCsv(filename);
      }
    } else {
      console.log(`${JOB_NAME}: SQLite database does not exist, falling back to CSV`);
      return getPrevBookListFromCsv(filename);
    }
  } catch (error) {
    console.error(`${JOB_NAME}: Error in getPrevBookList:`, error);
    return null;
  }
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

type BookListDiffResult = {
  prev: Book[];
  same: Book[];
  latest: Book[];
};

export function getBookListDiff(prevMap: BookList, latestMap: BookList): BookListDiffResult {
  const prevIds = new Set(prevMap.keys());
  const latestIds = new Set(latestMap.keys());

  return {
    prev: [...prevIds.difference(latestIds)].map((id) => prevMap.get(id)!),
    same: [...prevIds.intersection(latestIds)].map((id) => prevMap.get(id)!),
    latest: [...latestIds.difference(prevIds)].map((id) => latestMap.get(id)!)
  };
}

/**
 * ローカルのCSVとbookmeterのスクレイピング結果を比較する
 * 差分を検出したら、書誌情報を取得してCSVを新規生成する
 */
export const isBookListDifferent = (
  prevList: BookList | null,
  latestList: BookList,
  skipBookListComparison: boolean = false
): boolean => {
  if (skipBookListComparison || prevList === null) {
    return true; // 常に差分を検出したことにする
  }
  const diff = getBookListDiff(prevList, latestList);
  if (diff.latest.length > 0) {
    console.log(`${JOB_NAME}: Detected some diffs between the local and remote.`); //差分を検出した場合
    return true;
  } else {
    console.log(
      `${JOB_NAME}: Cannot find any differences between the local and remote. The process will be aborted...`
    );
    return false;
  }
};

export const makeEmptyBook = (isbn: ISBN10): Book => {
  return {
    bookmeter_url: "",
    isbn_or_asin: isbn,
    book_title: "",
    author: "",
    publisher: "",
    published_date: "",
    exist_in_Sophia: "No",
    exist_in_UTokyo: "No",
    sophia_opac: "",
    utokyo_opac: "",
    sophia_mathlib_opac: "",
    description: ""
  };
};
