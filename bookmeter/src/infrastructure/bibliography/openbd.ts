import { zip } from "../../../../.libs/utils";

import {
  makeLookupStatusInError,
  type BibliographyLookupResult,
  type BulkBibliographyEnricher,
  type BulkBibliographyLookupCommand
} from "@/application/bibliography";
import { Err, isErr, Ok, type AppError, type Result } from "@/domain/error";

export type OpenBdSummary = {
  isbn: string;
  title: string;
  volume: string;
  series: string;
  publisher: string;
  pubdate: string;
  cover: string;
  author: string;
};
export type OpenBdCollateralDetail = {
  TextContent?: {
    TextType: string;
    ContentAudience: string;
    Text: string;
  }[];
};
export type OpenBdResponse = ({
  summary: OpenBdSummary;
  onix: {
    CollateralDetail: OpenBdCollateralDetail;
  };
} | null)[];

/**
 * OpenBD検索
 */
export const bulkFetchOpenBD: BulkBibliographyEnricher = async (
  command: BulkBibliographyLookupCommand
): Promise<Result<BibliographyLookupResult[], AppError>> => {
  const targetBooks = command.input.map(({ book }) => book);
  const currentLookupStatuses = command.input.map(({ currentLookupStatus }) => currentLookupStatus);
  const targetIsbns = [...targetBooks].map((book) => book.isbnOrAsin).toString();

  const response = await command.dependencies.httpClient.get<OpenBdResponse>(
    `https://api.openbd.jp/v1/get?isbn=${targetIsbns}`,
    { responseType: "json" }
  );
  // TODO: APIエラー時はErrを返す代わりに、エラーステータスを設定したBibliographyLookupResultを返す
  if (isErr(response)) {
    return Err(response.err);
  }

  const results = [] as BibliographyLookupResult[];

  for (const [book, currentStatus, singleBookData] of zip(targetBooks, currentLookupStatuses, response.value.data)) {
    //本の情報がなかった
    if (singleBookData === null) {
      const status = makeLookupStatusInError(book, command.target, currentStatus, "NOT_FOUND_IN_OpenBD");
      results.push(status);
    }

    //本の情報があった
    if (singleBookData !== null) {
      const bookSummary = singleBookData.summary;
      const title = bookSummary.title === "" ? "" : `${bookSummary.title}`;
      const volume = bookSummary.volume === "" ? "" : ` ${bookSummary.volume}`;
      const series = bookSummary.series === "" ? "" : ` (${bookSummary.series})`;
      const part = {
        book_title: `${title}${volume}${series}`,
        author: bookSummary.author ?? "",
        publisher: bookSummary.publisher ?? "",
        published_date: bookSummary.pubdate ?? "",
        description: ""
      };
      results.push({
        book: { ...book, ...part },
        ...currentStatus,
        [command.target]: true
      });
    }
  }
  return Ok(results);
};
