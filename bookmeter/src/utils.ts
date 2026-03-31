/**
 * ファイル I/O やCSV読み込みなど、アプリケーションレベルのユーティリティ関数。
 * ドメインロジック（ISBN操作・差分検出）は domain/ に移動済み。
 */

import * as fsSync from "node:fs";
import fs from "node:fs/promises";

import { parse } from "papaparse";

import { BOOKMETER_DEFAULT_USER_ID, DEFAULT_CSV_FILENAME, JOB_NAME } from "./constants";

import type { BookRepository } from "./db/bookRepository";
import type { Book, BookList } from "./domain/book";
import type { ParseResult } from "papaparse";

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

export const readBookListCSV = async (filename: string): Promise<Book[] | null> => {
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
 * bookmeter url のリストを配列にデシリアライズする
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
 * 前回の書籍リストを SQLite データベースから読み出す。
 * データベースが存在しない場合は CSV からフォールバックする。
 */
export const getPrevBookList = async (filename: string, repo: BookRepository): Promise<BookList | null> => {
  try {
    let tableName: "wish" | "stacked";
    if (filename.includes("wish")) {
      tableName = "wish";
    } else if (filename.includes("stacked")) {
      tableName = "stacked";
    } else {
      console.warn(`${JOB_NAME}: Could not determine table name from filename ${filename}, falling back to CSV`);
      return getPrevBookListFromCsv(filename);
    }

    if (fsSync.existsSync("./books.sqlite")) {
      console.log(`${JOB_NAME}: Loading previous book list from SQLite database (table: ${tableName})`);
      try {
        const bookList = repo.load(tableName);
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
 * 前回の書籍リストを CSV から読み出し、Map にデシリアライズする。
 * 後方互換性のために保持。
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

/**
 * OPAC のリダイレクト URL を取得する。
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
