/**
 * Book エンティティとそれに関連するドメイン型・ドメインロジックを定義する。
 * 「変えない層」— 外側（db / scrapers / fetchers）を import しない。
 */

import type { CINII_TARGET_TAGS } from "../constants";
import type { ASIN, ISBN10 } from "./isbn";

export type CiniiTargetOrgs = (typeof CINII_TARGET_TAGS)[number];
export type ExistIn = `exist_in_${CiniiTargetOrgs}`;
export type OpacLink = `${Lowercase<CiniiTargetOrgs>}_opac`;

export type Book = {
  bookmeter_url: string;
  isbn_or_asin: ISBN10 | ASIN;
  book_title: string;
  author: string;
  publisher: string;
  published_date: string;
} & {
  [key in OpacLink]: string;
} & {
  [key in ExistIn]: "Yes" | "No";
} & {
  sophia_mathlib_opac: string;
  description: string;
};

export type BookList = Map<string, Book>;
export type CsvBookList = Map<string, Omit<Book, "description">>;

export const makeEmptyBook = (isbn: ISBN10): Book => {
  return {
    bookmeter_url: "",
    isbn_or_asin: isbn,
    book_title: "",
    author: "",
    publisher: "",
    published_date: "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    sophia_opac: "",
    utokyo_opac: "",
    sophia_mathlib_opac: "",
    description: ""
  };
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
 * ローカルのデータと bookmeter のスクレイピング結果を比較し、差分があるかを判定する。
 */
export const isBookListDifferent = (
  prevList: BookList | null,
  latestList: BookList,
  skipBookListComparison: boolean = false,
  jobName: string = "Bookmeter Wished Books"
): boolean => {
  if (skipBookListComparison || prevList === null) {
    return true;
  }
  const diff = getBookListDiff(prevList, latestList);
  if (diff.latest.length > 0) {
    console.log(`${jobName}: Detected some diffs between the local and remote.`);
    return true;
  } else {
    console.log(`${jobName}: Cannot find any differences between the local and remote. The process will be aborted...`);
    return false;
  }
};
