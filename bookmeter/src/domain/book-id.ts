export type Brand<K, T> = K & { __brand: T };

export type ISBN10 = Brand<string, "ISBN10">;
export type ISBN13 = Brand<string, "ISBN13">;
export type ASIN = Brand<string, "ASIN">;
export type BookmeterUrl = Brand<string, "BookmeterUrl">;

// ref: https://regexr.com/3gk2s
// ref: https://stackoverflow.com/questions/2123131/determine-if-10-digit-string-is-valid-amazon-asin
const AMAZON_ASIN_PATTERN = /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/;

// ref: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11143609671
// ref: https://www.oreilly.com/library/view/regular-expressions-cookbook/9781449327453/ch04s13.html
const ISBN_PATTERN =
  /(?=[0-9X]{10}|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}|97[89][0-9]{10}|(?=(?:[0-9]+[- ]){4})[- 0-9]{17})(?:97[89])?[0-9]{1,5}[0-9]+[0-9]+[0-9X]/g;
const ISBN10_PATTERN =
  /^(?:ISBN(?:-10)?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$)[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/;
const ISBN13_PATTERN =
  /^(?:ISBN(?:-13)?:? )?(?=[0-9]{13}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)97[89][- ]?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9]$/;

// ref: http://absg.hatenablog.com/entry/2016/03/17/190831
const NCID_IN_CINII_URL_PATTERN = /(?<=https:\/\/ci.nii.ac.jp\/ncid\/).*/;

export const PATTERNS = {
  amazonAsin: AMAZON_ASIN_PATTERN,
  isbn: ISBN_PATTERN,
  isbn10: ISBN10_PATTERN,
  isbn13: ISBN13_PATTERN,
  ncidInCiniiUrl: NCID_IN_CINII_URL_PATTERN
} as const;

export const isAsin = (value: ISBN10 | ISBN13 | ASIN): boolean => {
  if (isIsbn10(value) || isIsbn13(value)) {
    return false;
  }
  return PATTERNS.amazonAsin.test(value);
};

export const matchAsin = (url: string): string | null => {
  const matched = url.match(PATTERNS.amazonAsin);
  return matched?.[0] ?? null;
};

export const isIsbn10 = (value: ISBN10 | ISBN13 | ASIN): boolean => {
  return PATTERNS.isbn10.test(value);
};

export const isIsbn13 = (value: ISBN10 | ISBN13 | ASIN): boolean => {
  return PATTERNS.isbn13.test(value);
};

/**
 * ISBNから出版国を判定
 */
export const routeIsbn10 = (isbn10: ISBN10): "Japan" | "Others" => (isbn10[0] === "4" ? "Japan" : "Others");
export const isJapaneseBook = (isbn: ISBN10): boolean => routeIsbn10(isbn) === "Japan";

/**
 * @link https://qiita.com/iz-j/items/27b9656ebed1a4516ee1
 */
export const convertIsbn10To13 = (isbn10: ISBN10): ISBN13 => {
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
