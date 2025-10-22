export const REGEX = {
  amazonAsin: /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/,
  isbn: /(?=[0-9X]{10}|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}|97[89][0-9]{10}|(?=(?:[0-9]+[- ]){4})[- 0-9]{17})(?:97[89])?[0-9]{1,5}[0-9]+[0-9]+[0-9X]/g,
  isbn10:
    /^(?:ISBN(?:-10)?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$)[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/,
  isbn13:
    /^(?:ISBN(?:-13)?:? )?(?=[0-9]{13}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)97[89][- ]?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9]$/,
  ncidInCiniiUrl: /(?<=https:\/\/ci.nii.ac.jp\/ncid\/).*/
} as const;

export type CiniiTargetTag = "sophia" | "utokyo";

export type CiniiTarget = {
  tag: CiniiTargetTag;
  ciniiKid: string;
  opac: string;
};

export const CINII_TARGETS: CiniiTarget[] = [
  {
    tag: "utokyo",
    ciniiKid: "KI000221",
    opac: "https://opac.dl.itc.u-tokyo.ac.jp"
  },
  {
    tag: "sophia",
    ciniiKid: "KI00209X",
    opac: "https://www.lib.sophia.ac.jp"
  }
];

export const CINII_TARGET_TAGS: readonly CiniiTargetTag[] = ["sophia", "utokyo"] as const;

export const MATH_LIB_BOOKLIST = {
  ja: [
    "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_j.pdf",
    "https://mathlib-sophia.opac.jp/opac/file/view/202404-202503.pdf"
  ],
  enWithIsbn: "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_F_1.pdf"
} as const;
