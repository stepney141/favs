import type { ASIN, ISBN10, ISBN13, BookIdentifier } from "../models/isbn";

/**
 * ISBN10の形式を検証する
 * 10桁のISBNかどうかを判定
 */
export function isIsbn10(value: unknown): value is ISBN10 {
  if (typeof value !== "string") return false;
  return /^[0-9]{9}[0-9X]$/.test(value);
}

/**
 * ISBN13の形式を検証する
 * 13桁のISBNかどうかを判定
 */
export function isIsbn13(value: unknown): value is ISBN13 {
  if (typeof value !== "string") return false;
  return /^97[89][0-9]{10}$/.test(value);
}

/**
 * ASINの形式を検証する
 * AmazonのASINかどうかを判定
 * (ISBN10形式と一致する場合はfalseを返す)
 */
export function isAsin(value: unknown): value is ASIN {
  if (typeof value !== "string") return false;
  if (isIsbn10(value)) return false;
  return /^[A-Z0-9]{10}$/.test(value);
}

/**
 * 識別子がISBN（10桁または13桁）かどうかを判定
 */
export function isIsbn(value: unknown): value is ISBN10 | ISBN13 {
  return isIsbn10(value) || isIsbn13(value);
}

/**
 * ISBN10をISBN13に変換する
 * @param isbn10 10桁のISBN
 * @returns 13桁のISBN
 */
export function convertISBN10To13(isbn10: ISBN10): ISBN13 {
  // 1. 先頭に"978"を追加し、チェックディジットを除いた12桁の数値を作成
  const digits = `978${isbn10.slice(0, 9)}`;

  // 2. 奇数位置の数字に1を、偶数位置の数字に3を掛けて合計
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }

  // 3. 10から合計を10で割った余りを引く（10の場合は0）
  const checkDigit = (10 - (sum % 10)) % 10;

  // 4. ISBN13を返す
  return `${digits}${checkDigit}` as ISBN13;
}

/**
 * ISBN13をISBN10に変換する
 * 978から始まるISBN13のみ変換可能
 * @param isbn13 13桁のISBN
 * @returns 10桁のISBN、変換できない場合はnull
 */
export function convertISBN13To10(isbn13: ISBN13): ISBN10 | null {
  // 978から始まるISBN13のみ変換可能
  if (!isbn13.startsWith("978")) {
    return null;
  }

  // ISBN13から978を除いた9桁とチェックディジットを計算
  const digits = isbn13.substring(3, 12);

  // チェックディジットの計算（モジュラス11）
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }

  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? "0" : remainder === 1 ? "X" : (11 - remainder).toString();

  // ISBN10を返す
  return `${digits}${checkDigit}` as ISBN10;
}

/**
 * ISBN10の国コードを取得し、ルーティング判定を行う
 * 日本の書籍か海外の書籍かを判定
 * @param isbn10 10桁のISBN
 * @returns 'Japan'（日本の書籍）または'Others'（海外の書籍）
 */
export function routeIsbn10(isbn10: ISBN10): "Japan" | "Others" {
  // 最初の桁が4なら日本の書籍
  return isbn10[0] === "4" ? "Japan" : "Others";
}

/**
 * ISBN13の国コードを取得し、ルーティング判定を行う
 * 日本の書籍か海外の書籍かを判定
 * @param isbn13 13桁のISBN
 * @returns 'Japan'（日本の書籍）または'Others'（海外の書籍）
 */
export function routeIsbn13(isbn13: ISBN13): "Japan" | "Others" {
  // 978-4 で始まる場合は日本の書籍
  return isbn13.startsWith("9784") ? "Japan" : "Others";
}

/**
 * AmazonのURLからASINを抽出する
 * @param url AmazonのURL
 * @returns ASIN（抽出できない場合はnull）
 */
export function extractAsinFromUrl(url: string): BookIdentifier | null {
  // Amazon URLからASINを抽出するための正規表現
  const asinRegex = /(?:dp|product|ASIN)\/([A-Z0-9]{10})(?:\/|\?|$)/;
  const match = url.match(asinRegex);

  if (match && match[1]) {
    const value = match[1];

    // ASINがISBN10形式と一致するか確認
    if (isIsbn10(value)) {
      return value;
    }

    return value as ASIN;
  }

  return null;
}

/**
 * 文字列がISBN10、ISBN13、ASINのいずれかとして有効かチェックする
 * @param value チェックする文字列
 * @returns 有効な場合はBookIdentifier、無効な場合はnull
 */
export function validateBookIdentifier(value: string): BookIdentifier | null {
  if (isIsbn10(value)) {
    return value;
  }

  if (isIsbn13(value)) {
    return value;
  }

  if (isAsin(value)) {
    return value;
  }

  return null;
}
