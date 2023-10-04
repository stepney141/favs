import type { BIBLIOINFO_SOURCES } from "./constants";

export type BookDataTemplate = {
  bookmeter_url?: string;
  isbn_or_asin?: string;
  book_title?: string;
  author?: string;
  publisher?: string;
  published_date?: string;
  exist_in_sophia?: "Yes" | "No" | "";
  central_opac_link?: string;
  mathlib_opac_link?: string;
};

export type BIBLIOINFO_ERROR_STATUS = `Not_found_with_${(typeof BIBLIOINFO_SOURCES)[number]}`;

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
  "@context": string;
  "@graph": {
    "@type": string;
    "@id": string;
    "opensearch:totalResults": string;
    "opensearch:startIndex": string;
    "opensearch:itemsPerPage": string;
    items: {
      "@type": string;
      "@id": string;
      "dcndl:creator": string;
      "dc:title": string;
      "dcndl:publisher": string;
      "dcndl:pubDate": string;
      "dcndl:isbn": string;
    }[];
  }[];
};
