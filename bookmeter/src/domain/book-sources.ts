export type CiniiTargetOrgs = (typeof CINII_TARGET_TAGS)[number];

export type CiniiTarget = {
  tag: CiniiTargetOrgs;
  cinii_kid: string;
  opac: string;
};

/**
 * 検索対象となる図書館の情報
 */
export const CINII_TARGETS: CiniiTarget[] = [
  {
    tag: "utokyo",
    cinii_kid: "KI000221",
    opac: "https://opac.dl.itc.u-tokyo.ac.jp"
  },
  {
    tag: "sophia",
    cinii_kid: "KI00209X", //ref: https://ci.nii.ac.jp/library/FA005358
    opac: "https://www.lib.sophia.ac.jp"
  }
];

/**
 * この配列の順番で図書館が検索される
 * opacリンクは配列後方のものが優先される
 */
export const CINII_TARGET_TAGS = ["sophia", "utokyo"] as const;

export const BIBLIOINFO_SOURCES = ["OpenBD", "ISBNdb", "NDL", "GoogleBooks"] as const;
export type BiblioinfoSource = (typeof BIBLIOINFO_SOURCES)[number];

/**
 * @link 数学図書館の図書リスト https://mathlib-sophia.opac.jp/opac/Notice/detail/108
 */
export const MATH_LIB_BOOKLIST = {
  ja: [
    "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_j.pdf",
    "https://mathlib-sophia.opac.jp/opac/file/view/202404-202503.pdf"
  ],
  en_with_isbn: "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_F_1.pdf"
};
