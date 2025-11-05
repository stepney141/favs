/**
 * 検索対象となる図書館の情報
 */
export const CINII_TARGETS: CiniiTarget[] = [
  {
    tag: "utokyo",
    ciniiKid: "KI000221",
    opac: "https://opac.dl.itc.u-tokyo.ac.jp"
  },
  {
    tag: "sophia",
    ciniiKid: "KI00209X", //ref: https://ci.nii.ac.jp/library/FA005358
    opac: "https://www.lib.sophia.ac.jp"
  }
];

/**
 * この配列の順番で図書館が検索される
 * opacリンクは配列後方のものが優先される
 */
export const CINII_TARGET_TAGS = ["sophia", "utokyo"] as const;

export type CiniiTargetOrgs = (typeof CINII_TARGET_TAGS)[number];
export type CiniiTarget = {
  tag: CiniiTargetOrgs;
  ciniiKid: string;
  opac: string;
};

export const BIBLIOINFO_SOURCES = ["OpenBD", "ISBNdb", "NDL", "GoogleBooks"] as const;
export type BiblioInfoSource = (typeof BIBLIOINFO_SOURCES)[number];
