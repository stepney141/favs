import type {
  BibliographyLookupResult,
  SingleBibliographyEnricher,
  SingleBibliographyLookupCommand
} from "@/application/bibliography";

import { BookNotFoundError, ConfigError, Err, isErr, Ok, type AppError, type Result } from "@/domain/error";

const ISBNDB_API_URI = "https://api2.isbndb.com";

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

type IsbnDbErrorResponse = {
  errorType: string;
  errorMessage: "Not Found";
  trace: [];
};

export type IsbnDbSingleResponse =
  | {
      book: IsbnDbBook;
    }
  | IsbnDbErrorResponse;

const isErrorResponse = (
  response: IsbnDbSingleResponse
): response is Extract<IsbnDbSingleResponse, { errorMessage: "Not Found" }> => {
  return "errorMessage" in response;
};

export const createIsbnDbFetcher: SingleBibliographyEnricher = async (
  command: SingleBibliographyLookupCommand
): Promise<Result<BibliographyLookupResult, AppError>> => {
  const isbn = command.input.book.isbnOrAsin;
  const credential = command.config?.credentials?.isbnDbApiKey;
  if (!credential) {
    return Err(new ConfigError("IsbnDB API key is missing"));
  }

  const responseResult = await command.dependencies.httpClient.get<IsbnDbSingleResponse>(
    `${ISBNDB_API_URI}/book/${isbn}`,
    {
      headers: {
        Authorization: credential,
        "Content-Type": "application/json"
      },
      responseType: "json"
    }
  );

  if (isErr(responseResult)) {
    return Err(responseResult.err);
  }

  const response = responseResult.value;
  if (response.status === 404 || isErrorResponse(response.data)) {
    return Err(new BookNotFoundError("Book not found in IsbnDB"));
  }

  const bookinfo = response.data.book;
  const enriched = {
    book_title: bookinfo["title"] ?? "",
    author: bookinfo["authors"]?.join(", ") ?? "",
    publisher: bookinfo["publisher"] ?? "",
    published_date: bookinfo["date_published"] ?? ""
  };
  return Ok({
    book: { ...command.input.book, ...enriched },
    ...command.input.currentLookupStatus,
    [command.target]: true
  });
};
