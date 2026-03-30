import * as fsSync from "node:fs";
import fs from "node:fs/promises";

import { FetchError } from "node-fetch";

import { Err, HttpError, Ok, type Result } from "@/domain/error";

/**
 * OPACのリダイレクトURLを取得
 * @example 
 input: https://www.lib.sophia.ac.jp/opac/opac_openurl/?isbn=1000000000 //invalid
 => https://www.lib.sophia.ac.jp/opac/opac_search/?direct=1&ou_srh=1&amode=2&lang=0&isbn=1000000000
 input: https://www.lib.sophia.ac.jp/opac/opac_openurl/?isbn=4326000481 //valid
 => https://www.lib.sophia.ac.jp/opac/opac_details/?lang=0&opkey=B170611882191096&srvce=0&amode=11&bibid=1003102195
 */
export const getRedirectedUrl = async (targetUrl: string): Promise<Result<string, HttpError>> => {
  try {
    const response = await fetch(targetUrl, {
      redirect: "follow"
    });
    return Ok(response.url);
  } catch (error) {
    if (error instanceof FetchError) {
      return Err(
        new HttpError({
          message: error.message,
          status: error.code === undefined ? 0 : Number(error.code),
          url: targetUrl
        })
      );
    }
    return Err(
      new HttpError({
        message: "Unknown error occurred during getRedirectedUrl",
        status: 0,
        url: targetUrl
      })
    );
  }
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
