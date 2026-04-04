/**
 * 前回の書籍リストを SQLite / CSV から読み出すユーティリティ。
 * CSV ファイル名の生成もここで行う。
 */

import * as fsSync from "node:fs";
import fs from "node:fs/promises";

import { parse } from "papaparse";

import { DEFAULT_BOOKMETER_USER_ID } from "../application/executionMode";

import { DEFAULT_CSV_FILENAME } from "./constants";

import type { BookRepository } from "./bookRepository";
import type { Book, BookList } from "../domain/book";
import type { ParseResult } from "papaparse";

export type OutputFilePath = {
  wish: string;
  stacked: string;
};

export const buildCsvFileName = (userId: string, filePath: OutputFilePath | null = null): OutputFilePath => {
  if (filePath === null) {
    if (userId === DEFAULT_BOOKMETER_USER_ID) return DEFAULT_CSV_FILENAME;
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
      console.warn(`Could not determine table name from filename ${filename}, falling back to CSV`);
      return getPrevBookListFromCsv(filename);
    }

    if (fsSync.existsSync("./books.sqlite")) {
      console.log(`Loading previous book list from SQLite database (table: ${tableName})`);
      const loadResult = repo.load(tableName);
      if (loadResult.ok) {
        if (loadResult.value.size > 0) {
          return loadResult.value;
        } else {
          console.log(`SQLite table ${tableName} exists but is empty, falling back to CSV`);
          return getPrevBookListFromCsv(filename);
        }
      } else {
        console.error("Error loading from SQLite:", loadResult.err);
        console.log("Falling back to CSV file");
        return getPrevBookListFromCsv(filename);
      }
    } else {
      console.log("SQLite database does not exist, falling back to CSV");
      return getPrevBookListFromCsv(filename);
    }
  } catch (error) {
    console.error("Error in getPrevBookList:", error);
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
