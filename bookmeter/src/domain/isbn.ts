/**
 * ISBN/ASIN に関するドメインロジック。
 * 外部環境（DB・HTTP・ブラウザ）に依存しない純粋関数と型定義を提供する。
 */

import type { Brand } from "../../../.libs/lib";

export type ISBN10 = Brand<string, "ISBN10">;
export type ISBN13 = Brand<string, "ISBN13">;
export type ASIN = Brand<string, "ASIN">;

// ref: http://absg.hatenablog.com/entry/2016/03/17/190831
// ref: https://regexr.com/3gk2s
// ref: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11143609671
// ref: https://stackoverflow.com/questions/2123131/determine-if-10-digit-string-is-valid-amazon-asin
const REGEX_AMAZON_ASIN = /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/;

// ref: https://www.oreilly.com/library/view/regular-expressions-cookbook/9781449327453/ch04s13.html
/** PDF 等の非構造テキストから ISBN を抽出するための正規表現 */
export const REGEX_ISBN_GLOBAL =
  /(?=[0-9X]{10}|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}|97[89][0-9]{10}|(?=(?:[0-9]+[- ]){4})[- 0-9]{17})(?:97[89])?[0-9]{1,5}[0-9]+[0-9]+[0-9X]/g;

const REGEX_ISBN10 =
  /^(?:ISBN(?:-10)?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$)[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/;
const REGEX_ISBN13 =
  /^(?:ISBN(?:-13)?:? )?(?=[0-9]{13}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)97[89][- ]?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9]$/;

export const isIsbn10 = (str: string): str is ISBN10 => {
  return REGEX_ISBN10.test(str);
};

export const isIsbn13 = (str: string): str is ISBN13 => {
  return REGEX_ISBN13.test(str);
};

export const isAsin = (str: string): str is ASIN => {
  if (isIsbn10(str)) {
    return false;
  }
  return REGEX_AMAZON_ASIN.test(str);
};

/**
 * ISBN-10 を ISBN-13 に変換する。
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

  return `${src}${checkdigit}` as ISBN13;
};

/**
 * Amazon へのリンクに含まれる ASIN（ISBN含む）を抽出する。
 */
export const matchASIN = (url: string): string | null => {
  const matched = url.match(REGEX_AMAZON_ASIN);
  return matched?.[0] ?? null;
};

/**
 * ISBN-10 の先頭桁から和書/洋書を判定する。
 */
export const routeIsbn10 = (isbn10: ISBN10): "Japan" | "Others" => (isbn10[0] === "4" ? "Japan" : "Others");
