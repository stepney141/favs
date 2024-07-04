import fs from "node:fs/promises";

import { parse } from "papaparse";

import { JOB_NAME, REGEX } from "./constants";

import type { ASIN, Book, BookList, ISBN10, ISBN13 } from "./types";
import type { ParseResult } from "papaparse";

export const isIsbn10 = (str: string): str is ISBN10 => {
  return str.match(REGEX.isbn10) !== null;
};
export const isIsbn13 = (str: string): str is ISBN13 => {
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

export const isAsin = (str: string): str is ASIN => {
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

export const readCSV = async (filename: string) => {
  const data = await fs.readFile(filename, "utf-8");
  const parsedObj = parse(data, {
    header: true,
    complete: (results: ParseResult<Book>) => results
  });
  return parsedObj.data;
};

/**
 * 前回の書籍リストをCSVから読み出し、Mapにデシリアライズする
 */
export const getPrevBookList = async (filename: string): Promise<BookList> => {
  const csv = await readCSV(filename);
  const prevList: BookList = new Map();
  for (const obj of csv) {
    prevList.set(obj["bookmeter_url"], { ...obj });
  }
  return prevList;
};

/**
 * ローカルのCSVとbookmeterのスクレイピング結果を比較する
 * 差分を検出したら、書誌情報を取得してCSVを新規生成する
 */
export const isBookListDifferent = (
  latestList: BookList,
  prevList: BookList,
  skipBookListComparison: boolean = false
): boolean => {
  if (skipBookListComparison) {
    return true; // 常に差分を検出したことにする
  }

  for (const key of latestList.keys()) {
    if (prevList.has(key) === false) {
      //ローカルのCSVとbookmeterのスクレイピング結果を比較
      console.log(`${JOB_NAME}: Detected some diffs between the local and remote.`); //差分を検出した場合
      return true;
    }
  }

  //差分を検出しなかった場合
  console.log(`${JOB_NAME}: Cannot find any differences between the local and remote. The process will be aborted...`);
  return false;
};
