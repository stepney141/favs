import type { CiniiTarget } from "./types";

export const JOB_NAME = "Bookmeter Wished Books";
export const CSV_FILENAME = "bookmeter_wish_books.csv";

export const bookmeter_baseURI = "https://bookmeter.com";
export const bookmeter_userID = "1003258";

export const XPATH = {
  isBookExist: "/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li",
  booksUrl: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a",
  amazonLink: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[4]/a",
  accountNameInput: '//*[@id="session_email_address"]',
  passwordInput: '//*[@id="session_password"]',
  loginButton: '//*[@id="js_sessions_new_form"]/form/div[4]/button'
};

export const REGEX = {
  // ref: http://absg.hatenablog.com/entry/2016/03/17/190831
  // ref: https://regexr.com/3gk2s
  // ref: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11143609671
  // ref: https://stackoverflow.com/questions/2123131/determine-if-10-digit-string-is-valid-amazon-asin
  amazon_asin: /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/,

  // ref: https://www.oreilly.com/library/view/regular-expressions-cookbook/9781449327453/ch04s13.html
  isbn: /(?=[0-9X]{10}|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}|97[89][0-9]{10}|(?=(?:[0-9]+[- ]){4})[- 0-9]{17})(?:97[89])?[0-9]{1,5}[0-9]+[0-9]+[0-9X]/g,
  isbn10:
    /^(?:ISBN(?:-10)?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$)[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/,
  isbn13:
    /^(?:ISBN(?:-13)?:? )?(?=[0-9]{13}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)97[89][- ]?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9]$/,

  ncid_in_cinii_url: /(?<=https:\/\/ci.nii.ac.jp\/ncid\/).*/
};

export const BIBLIOINFO_SOURCES = ["OpenBD", "Amazon", "NDL", "GoogleBooks"] as const;

/**
 * 検索対象となる図書館の情報
 */
export const CINII_TARGETS: CiniiTarget[] = [
  {
    tag: "UTokyo",
    cinii_kid: "KI000221",
    opac: "https://opac.dl.itc.u-tokyo.ac.jp"
  },
  {
    tag: "Sophia",
    cinii_kid: "KI00209X", //ref: https://ci.nii.ac.jp/library/FA005358
    opac: "https://www.lib.sophia.ac.jp"
  }
];

/**
 * この配列の順番で図書館が検索される
 * opacリンクは配列後方のものが優先される
 */
export const CINII_TARGET_TAGS = ["UTokyo", "Sophia"] as const;

export const MATH_LIB_BOOKLIST = {
  //数学図書館の図書リスト ref: https://mathlib-sophia.opac.jp/opac/Notice/detail/108
  ja: [
    "https://mathlib-sophia.opac.jp/opac/file/view/1965-2021_j.pdf",
    "https://mathlib-sophia.opac.jp/opac/file/view/2022.4-2023.2.pdf",
    "https://mathlib-sophia.opac.jp/opac/file/view/2023.4-2023.12.pdf"
  ],
  en_with_isbn: "https://mathlib-sophia.opac.jp/opac/file/view/1965-2021_F1.pdf"
};
