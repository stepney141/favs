import { XMLParser } from "fast-xml-parser";

import {
  makeLookupStatusInError,
  type BibliographyLookupStatus,
  type BibliographyLookupResult,
  type SingleBibliographyEnricher,
  type SingleBibliographyLookupCommand
} from "@/application/bibliography";
import { isIsbn10 } from "@/domain/book-id";
import { BIBLIOINFO_SOURCES } from "@/domain/book-sources";
import { Err, isErr, Ok, type AppError, type Result } from "@/domain/error";

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

const xmlParser = new XMLParser();

/**
 * 国立国会図書館 書誌検索
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */
export const fetchNDL: SingleBibliographyEnricher = async (
  command: SingleBibliographyLookupCommand
): Promise<Result<BibliographyLookupResult, AppError>> => {
  const { book } = command.input;
  const isbn = book.isbnOrAsin;
  const title = encodeURIComponent(book.title);
  const author = encodeURIComponent(book.author);
  const useIsbn = command?.config?.useIsbn ?? true;

  const query = isIsbn10(isbn) ? `isbn=${isbn}` : `any=${title} ${author}`;

  // xml形式でレスポンスが返ってくる
  const response = await command.dependencies.httpClient.get<string>(
    `https://ndlsearch.ndl.go.jp/api/opensearch?${query}`,
    {
      responseType: "text"
    }
  );
  // TODO: APIエラー時はErrを返す代わりに、エラーステータスを設定したBibliographyLookupResultを返す
  if (isErr(response)) {
    return Err(response.err);
  }
  const jsonResponse = xmlParser.parse(response.value.data) as NdlResponseJson; // xmlをjsonに変換
  const bookData = jsonResponse.rss.channel;

  //本の情報があった
  if ("item" in bookData) {
    // 該当結果が単数か複数かによって、返却される値がObjectなのかArray<Object>なのか変わる。
    // fast-xml-parserの設定をいじればスマートにできるかもしれないが、とりあえず目的を達成するにはこれだけ判定すれば十分。
    // 面倒なので、該当件数に関わらず配列の先頭だけをチェックしておく。
    const bookinfo = Array.isArray(bookData.item) ? bookData.item[0] : bookData.item;
    const title = bookinfo["title"] ?? "";
    const volume = bookinfo["dcndl:volume"] ?? "";
    const series = bookinfo["dcndl:seriesTitle"] ?? "";
    const part = {
      book_title: `${title}${volume === "" ? volume : " " + volume}${series === "" ? series : " / " + series}`,
      author: bookinfo["author"] ?? "",
      publisher: bookinfo["dc:publisher"] ?? "",
      published_date: bookinfo["pubDate"] ?? ""
    };

    const lookupStatus = Object.fromEntries(
      BIBLIOINFO_SOURCES.map((k) => [k, k === "NDL"])
    ) as BibliographyLookupStatus;
    return Ok({
      book: { ...book, ...part },
      ...lookupStatus
    });

    //本の情報がなかった
  } else {
    if (useIsbn) {
      // ISBNで検索しても情報がなかった場合、タイトルと著者で再検索
      const newCommand: SingleBibliographyLookupCommand = {
        ...command,
        config: {
          ...command.config,
          useIsbn: false
        }
      };
      return await fetchNDL(newCommand);
    }

    const status = makeLookupStatusInError(book, command.target, command.input.currentLookupStatus, "NOT_FOUND_IN_NDL");
    return Ok(status);
  }
};
