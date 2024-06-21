import { REGEX, type BIBLIOINFO_SOURCES, type CINII_TARGET_TAGS } from "./constants";

import type { Brand } from "../.libs/lib";

export type Book = {
  bookmeter_url: string;
  isbn_or_asin: ISBN10 | ASIN | null;
  book_title: string;
  author: string;
  publisher: string;
  published_date: string;
  sophia_mathlib_opac: string;
  description: string;
} & {
  [key in OpacLink]: string;
} & {
  [key in ExistIn]: "Yes" | "No";
};
export type BookList = Map<string, Book>;

export type BiblioInfoStatus = { book: Book; isFound: boolean };
export type FetchBiblioInfo = (book: Book) => BiblioInfoStatus | Promise<BiblioInfoStatus>;

export type BookOwningStatus = { book: Book; isOwning: boolean };
export type IsOwnBookConfig<T> = { book: Book; options?: { resources?: T; libraryInfo?: CiniiTarget } };
export type IsOwnBook<T> =
  | ((config: IsOwnBookConfig<T>) => BookOwningStatus)
  | ((config: IsOwnBookConfig<T>) => Promise<BookOwningStatus>);

export type BiblioinfoErrorStatus = `Not_found_in_${(typeof BIBLIOINFO_SOURCES)[number]}` | "INVALID_ISBN";

export type CiniiTargetOrgs = (typeof CINII_TARGET_TAGS)[number];
export type ExistIn = `exist_in_${CiniiTargetOrgs}`;
export type OpacLink = `${Lowercase<CiniiTargetOrgs>}_opac`;
export type CiniiTarget = {
  tag: CiniiTargetOrgs;
  cinii_kid: string;
  opac: string;
};

export namespace OpenBD {
  export type Summary = {
    isbn: string;
    title: string;
    volume: string;
    series: string;
    publisher: string;
    pubdate: string;
    cover: string;
    author: string;
  };
  export type CollateralDetail = {
    TextContent?: {
      TextType: string;
      ContentAudience: string;
      Text: string;
    }[];
  };
  export type Response = ({
    summary: Summary;
    onix: {
      CollateralDetail: CollateralDetail;
    };
  } | null)[];
}

export type NdlResponseJson = {
  rss: {
    channel: {
      item:
        | {
            title: string;
            author: string;
            "dc:publisher": string;
            pubDate: string;
          }
        | {
            title: string;
            author: string;
            "dc:publisher": string;
            pubDate: string;
          }[];
    };
  };
};

export type CiNiiItem = {
  "@type": string;
  "@id": string;
  "dc:creator": string;
  "dc:title": string;
  "dc:publisher": string;
  "dc:pubDate": string;
  "dc:isbn": string;
};

export type CiniiResponse = {
  "@graph":
    | {
        "@type": string;
        "@id": string;
        "opensearch:totalResults": "0";
        "opensearch:startIndex": "0";
        "opensearch:itemsPerPage": "0";
      }[]
    | {
        "@type": string;
        "@id": string;
        items: CiNiiItem[];
      }[];
  "@context": {
    dc: string;
    rdf: string;
    opensearch: string;
    rdfs: string;
    dcterms: string;
    prism: string;
    cinii: string;
    "@vocab": string;
  };
};

/**
 * @link https://developers.google.com/books/docs/v1/reference/volumes?hl=en
 */
export type GoogleBookItem = {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: {
      type: "ISBN_10" | "ISBN_13";
      identifier: string;
    }[];
    pageCount?: number;
    printType?: string;
    language?: string;
    infoLink?: string;
  };
};

/**
 * @link https://developers.google.com/books/docs/v1/reference/volumes/list?hl=en
 */
export type GoogleBookApiResponse = {
  kind: string;
  items?: GoogleBookItem[];
  totalItems: number;
};

export type ISBN10 = Brand<string, "ISBN10">;
export type ISBN13 = Brand<string, "ISBN13">;
export type ASIN = Brand<string, "ASIN">;

export const isIsbn10 = (str: string): str is ISBN10 => {
  return str.match(REGEX.isbn10) !== null;
};
export const isIsbn13 = (str: string): str is ISBN13 => {
  return str.match(REGEX.isbn13) !== null;
};
export const isAsin = (str: string): str is ASIN => {
  if (isIsbn10(str)) {
    return false;
  }
  return str.match(REGEX.amazon_asin) !== null;
};
