import type { BIBLIOINFO_SOURCES, CINII_TARGET_TAGS } from "./constants";

export type Book = {
  bookmeter_url: string;
  isbn_or_asin: string | null;
  book_title: string;
  author: string;
  publisher: string;
  published_date: string;
  central_opac_link: string;
  mathlib_opac_link: string;
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

export type CiniiTarget = {
  tag: CiniiTargetOrgs;
  cinii_id: string;
  opac: string;
};

export type OpenBdResponse = {
  summary: {
    isbn: string;
    title: string;
    volume: string;
    series: string;
    publisher: string;
    pubdate: string;
    cover: string;
    author: string;
  };
}[];

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

export type CiniiResponse = {
  "@id": string;
  "@graph": {
    "@type": string;
    "@id": string;
    "opensearch:totalResults": string;
    "opensearch:startIndex": string;
    "opensearch:itemsPerPage": string;
    items?: {
      "@type": string;
      "@id": string;
      "dc:creator": string;
      "dc:title": string;
      "dc:publisher": string;
      "dc:pubDate": string;
      "dc:isbn": string;
    }[];
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
