import {
  makeLookupStatusInError,
  type SingleBibliographyLookupCommand,
  type BibliographyLookupResult,
  type SingleBibliographyEnricher
} from "@/application/bibliography";
import { ConfigError, Err, InvalidIsbnError, isErr, Ok, type AppError, type Result } from "@/domain/error";

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

/**
 * Google Booksの検索
 * @link https://developers.google.com/books/docs/v1/reference/volumes/list?hl=en
 */
export const fetchGoogleBooks: SingleBibliographyEnricher = async (
  command: SingleBibliographyLookupCommand
): Promise<Result<BibliographyLookupResult, AppError>> => {
  const { book } = command.input;
  const { credentials } = command.config ?? {};
  if (!credentials) {
    return Err(new ConfigError("API credentials are missing"));
  }

  const isbn = book.isbnOrAsin;
  if (isbn === null || isbn === undefined) {
    return Err(new InvalidIsbnError(isbn));
  }
  const credential = credentials.googleBooksApiKey;
  if (credential === null || credential === undefined) {
    return Err(new ConfigError("GoogleBooks API key is missing"));
  }

  const response = await command.dependencies.httpClient.get<GoogleBookApiResponse>(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${credential}`,
    {
      responseType: "json"
    }
  );
  if (isErr(response)) {
    return Err(response.err);
  }

  const json = response.value.data;

  //本の情報があった
  if (json.totalItems !== 0 && json.items !== undefined) {
    const bookinfo = json.items[0].volumeInfo;
    const subtitle = bookinfo.subtitle ?? "";
    const enrichedBook = {
      ...book,
      book_title: `${bookinfo.title}${subtitle === "" ? subtitle : " " + subtitle}`,
      author: bookinfo.authors?.toString() ?? "",
      publisher: bookinfo.publisher ?? "",
      published_date: bookinfo.publishedDate ?? ""
    };
    return Ok({
      book: enrichedBook,
      ...command.input.currentLookupStatus,
      [command.target]: true
    });
  } else {
    const errorStatus = makeLookupStatusInError(
      book,
      command.target,
      command.input.currentLookupStatus,
      "NOT_FOUND_IN_GoogleBooks"
    );
    return Ok(errorStatus);
  }
};
