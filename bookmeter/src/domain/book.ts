/**
 * Book エンティティとそれに関連するドメイン型・ドメインロジックを定義する。
 * 「変えない層」— 外側（db / scrapers / fetchers）を import しない。
 */

import type { ASIN, ISBN10 } from "./isbn";

/**
 * 検索対象となる図書館組織タグ。
 * この配列の順番で図書館が検索される（opacリンクは配列後方のものが優先）。
 */
export const CINII_TARGET_TAGS = ["sophia", "utokyo"] as const;

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

function hasBookListOrderChanged(prevList: BookList, latestList: BookList): boolean {
  const prevUrls = [...prevList.keys()];
  const latestUrls = [...latestList.keys()];

  if (prevUrls.length !== latestUrls.length) {
    return true;
  }

  return prevUrls.some((bookmeterUrl, index) => bookmeterUrl !== latestUrls[index]);
}

/**
 * ローカルのデータと bookmeter のスクレイピング結果を比較し、差分があるかを判定する。
 */
export const isBookListDifferent = (
  prevList: BookList | null,
  latestList: BookList,
  skipBookListComparison: boolean = false
): boolean => {
  if (skipBookListComparison || prevList === null) {
    return true;
  }

  const diff = getBookListDiff(prevList, latestList);
  if (diff.latest.length > 0 || diff.prev.length > 0) {
    console.log("Detected some diffs between the local and remote.");
    return true;
  }

  if (hasBookListOrderChanged(prevList, latestList)) {
    console.log("Detected an ordering diff between the local and remote.");
    return true;
  }

  console.log("Cannot find any differences between the local and remote. The process will be aborted...");
  return false;
};
