/**
 * ブランド化された型のためのユーティリティ型
 * プリミティブ型に意味を持たせるために使用する
 */
export type Brand<T, B> = T & { readonly __brand: B };

/**
 * 書籍ID
 * 書籍を一意に識別するためのID
 */
export type BookId = Brand<string, "BookId">;

export type ISBN10 = Brand<string, "ISBN10">;
export type ISBN13 = Brand<string, "ISBN13">;
export type ASIN = Brand<string, "ASIN">;

/**
 * 書籍識別子
 * ISBN10、ISBN13、ASINのいずれかで表される書籍の識別子
 */
export type BookIdentifier = ISBN10 | ISBN13 | ASIN;

/**
 * 書籍IDを生成する
 * @param value ID値
 * @returns BookId
 */
export function createBookId(value: string): BookId {
  return value as BookId;
}

/**
 * ISBN10を生成する
 * 実際のアプリケーションでは検証ロジックを追加すべきです
 * @param value ISBN10文字列
 * @returns ISBN10
 */
export function createISBN10(value: string): ISBN10 {
  return value as ISBN10;
}

/**
 * ISBN13を生成する
 * 実際のアプリケーションでは検証ロジックを追加すべきです
 * @param value ISBN13文字列
 * @returns ISBN13
 */
export function createISBN13(value: string): ISBN13 {
  return value as ISBN13;
}

/**
 * ASINを生成する
 * 実際のアプリケーションでは検証ロジックを追加すべきです
 * @param value ASIN文字列
 * @returns ASIN
 */
export function createASIN(value: string): ASIN {
  return value as ASIN;
}
