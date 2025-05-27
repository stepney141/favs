/**
 * OpenBD APIのレスポンス型定義
 */
export type OpenBDResponse = (OpenBDBookInfo | null)[];

export interface OpenBDBookInfo {
  summary: OpenBDSummary;
  onix: {
    CollateralDetail: OpenBDCollateralDetail;
  };
}

export interface OpenBDSummary {
  isbn: string;
  title: string;
  volume: string;
  series: string;
  publisher: string;
  pubdate: string;
  author: string;
  cover: string;
}

export interface OpenBDCollateralDetail {
  TextContent?: {
    TextType: string;
    ContentAudience: string;
    Text: string;
  }[];
}

/**
 * Google Books APIのレスポンス型定義
 * @link https://developers.google.com/books/docs/v1/reference/volumes/list?hl=en
 */
export type GoogleBookApiResponse = {
  kind: string;
  items?: GoogleBookItem[];
  totalItems: number;
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
 * CiNii APIのレスポンス型定義
 */
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

export type CiNiiItem = {
  "@type": string;
  "@id": string;
  "dc:creator": string;
  "dc:title": string;
  "dc:publisher": string;
  "dc:pubDate": string;
  "dc:isbn": string;
};

/**
 * NDL APIのレスポンス型定義
 */
export type NdlResponseJson = {
  rss: {
    channel: {
      item:
        | {
            title: string;
            "dcndl:seriesTitle"?: string;
            "dcndl:volume"?: string;
            author: string;
            "dc:publisher": string;
            pubDate: string;
          }
        | {
            title: string;
            "dcndl:seriesTitle"?: string;
            "dcndl:volume"?: string;
            author: string;
            "dc:publisher": string;
            pubDate: string;
          }[];
    };
  };
};

/**
 * ISBNdb APIのレスポンス型定義
 */
export type IsbnDbResponse =
  | {
      book: IsbnDbBook;
    }
  | {
      errorType: string;
      errorMessage: "Not Found";
      trace: [];
    };

export type IsbnDbBook = {
  title: string;
  title_long: string;
  isbn: string;
  isbn13: string;
  dewey_decimal: string;
  binding: string;
  publisher: string;
  language: string;
  date_published: string;
  edition: string;
  pages: 0;
  dimensions: string;
  dimensions_structured: {
    length: {
      unit: string;
      value: 0;
    };
    width: {
      unit: string;
      value: 0;
    };
    height: {
      unit: string;
      value: 0;
    };
    weight: {
      unit: string;
      value: 0;
    };
  };
  overview: string;
  image: string;
  msrp: 0;
  excerpt: string;
  synopsis: string;
  authors: string[];
  subjects: string[];
  reviews: string[];
  prices: [
    {
      condition: string;
      merchant: string;
      merchant_logo: string;
      merchant_logo_offset: {
        x: string;
        y: string;
      };
      shipping: string;
      price: string;
      total: string;
      link: string;
    }
  ];
  related: {
    type: string;
  };
  other_isbns: [
    {
      isbn: string;
      binding: string;
    }
  ];
};
