import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { convertToApiError, logAxiosError } from "../../utils/apiUtils";

import { isIsbnIdentifier } from "./helpers";

import type {
  GoogleBookApiResponse,
  IsbnDbResponse,
  NdlResponseJson,
  OpenBDBookInfo,
  OpenBDResponse
} from "./externalApiTypes";
import type { BulkProvider, SingleProvider } from "./types";
import type { Logger } from "@/application/ports/output/logger";
import type { Book } from "@/domain/models/book";
import type { Result } from "@/domain/models/result";
import type { BookIdentifier, BookId } from "@/domain/models/valueObjects";
import type { AxiosResponse } from "axios";

import { ApiError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";

/**
 * OpenBD書籍情報を標準Bookオブジェクトに変換
 */
const convertOpenBDToBook = (identifier: BookIdentifier, bookInfo: Readonly<OpenBDBookInfo>): Book => {
  const summary = bookInfo.summary;
  const title = summary.title || "";
  const volume = summary.volume || "";
  const series = summary.series || "";
  const bookTitle = `${title}${volume ? ` ${volume}` : ""}${series ? ` (${series})` : ""}`;

  return {
    id: "" as unknown as BookId, // 後で設定
    identifier: identifier,
    url: "", // 後で設定
    title: bookTitle,
    author: summary.author || "",
    publisher: summary.publisher || "",
    publishedDate: summary.pubdate || "",
    description: "",
    libraryInfo: {
      existsIn: new Map(),
      opacLinks: new Map()
    }
  };
};

/**
 * OpenBD API から単一書籍情報を取得
 */
const fetchSingleFromOpenBD = async (identifier: BookIdentifier, logger?: Logger): Promise<Result<ApiError, Book>> => {
  const endpoint = "https://api.openbd.jp/v1/get";

  if (!isIsbnIdentifier(identifier)) {
    return err(new ApiError("サポートされていない識別子形式です", 400, endpoint));
  }

  try {
    const response = await axios<OpenBDResponse>({
      method: "get",
      url: `${endpoint}?isbn=${identifier}`,
      responseType: "json"
    });

    const bookInfo = response.data[0];

    if (!bookInfo) {
      return err(new ApiError("書籍情報が見つかりませんでした", 404, endpoint));
    }

    return ok(convertOpenBDToBook(identifier, bookInfo));
  } catch (error) {
    logAxiosError(error, "OpenBD", `ISBN: ${identifier}`, logger);
    return err(convertToApiError(error, "OpenBD", endpoint));
  }
};

/**
 * OpenBD API から一括書籍情報を取得
 */
const fetchBulkFromOpenBD = async (
  identifiers: BookIdentifier[],
  logger?: Logger
): Promise<Result<ApiError, Map<string, Book>>> => {
  const endpoint = "https://api.openbd.jp/v1/get";

  if (identifiers.length === 0) {
    return ok(new Map());
  }

  try {
    const response = await axios<OpenBDResponse>({
      method: "get",
      url: `${endpoint}?isbn=${identifiers.join(",")}`,
      responseType: "json"
    });

    const results = new Map<string, Book>();

    for (let i = 0; i < identifiers.length; i++) {
      const identifier = identifiers[i];
      const bookInfo = response.data[i];

      if (bookInfo) {
        results.set(identifier, convertOpenBDToBook(identifier, bookInfo));
      }
    }

    return ok(results);
  } catch (error) {
    logger?.error(`OpenBD API呼び出し中にエラーが発生しました`, {
      error: error instanceof Error ? error.message : String(error),
      endpoint: endpoint
    });
    return err(convertToApiError(error, "OpenBD", endpoint));
  }
};

/**
 * OpenBD プロバイダーファクトリ
 */
export const createOpenBDProvider = (logger?: Logger): BulkProvider => ({
  config: {
    name: "OpenBD",
    supportsIdentifier: isIsbnIdentifier
  },
  fetchSingle: (identifier: BookIdentifier) => fetchSingleFromOpenBD(identifier, logger),
  fetchBulk: (identifiers: BookIdentifier[]) => fetchBulkFromOpenBD(identifiers, logger)
});

/**
 * Google Books プロバイダーファクトリ
 */
export const createGoogleBooksProvider = (credential: string, logger?: Logger): SingleProvider => ({
  config: {
    name: "GoogleBooks",
    supportsIdentifier: isIsbnIdentifier
  },
  fetchSingle: async (identifier: BookIdentifier) => {
    const endpoint = "https://www.googleapis.com/books/v1/volumes";

    if (!isIsbnIdentifier(identifier)) {
      return err(new ApiError("サポートされていない識別子形式です", 400, endpoint));
    }

    try {
      const response = await axios<GoogleBookApiResponse>({
        method: "get",
        url: `${endpoint}?q=isbn:${identifier}&key=${credential}`,
        responseType: "json"
      });

      const json = response.data;

      if (json.totalItems === 0 || !json.items || json.items.length === 0) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, endpoint));
      }

      const bookinfo = json.items[0].volumeInfo;
      const title = bookinfo.title || "";
      const subtitle = bookinfo.subtitle || "";
      const formattedTitle = `${title}${subtitle ? " " + subtitle : ""}`;

      return ok({
        id: "" as unknown as BookId,
        identifier: identifier,
        url: "",
        title: formattedTitle,
        author: bookinfo.authors?.join(", ") || "",
        publisher: bookinfo.publisher || "",
        publishedDate: bookinfo.publishedDate || "",
        description: bookinfo.description || "",
        libraryInfo: {
          existsIn: new Map(),
          opacLinks: new Map()
        }
      });
    } catch (error) {
      logAxiosError(error, "GoogleBooks", `ISBN: ${identifier}`, logger);
      return err(convertToApiError(error, "GoogleBooks", endpoint));
    }
  }
});

/**
 * ISBNdb プロバイダーファクトリ
 */
export const createISBNdbProvider = (credential: string, logger?: Logger): SingleProvider => ({
  config: {
    name: "ISBNdb",
    supportsIdentifier: isIsbnIdentifier
  },
  fetchSingle: async (identifier: BookIdentifier) => {
    const endpoint = "https://api2.isbndb.com/book";

    if (!isIsbnIdentifier(identifier)) {
      return err(new ApiError("サポートされていない識別子形式です", 400, endpoint));
    }

    try {
      const instance = axios.create({
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404
      });

      const response = await instance<IsbnDbResponse>({
        method: "get",
        url: `${endpoint}/${identifier}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: credential
        },
        responseType: "json"
      });

      if (response.status === 404 || "errorMessage" in response.data) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, endpoint));
      }

      const bookInfo = response.data.book;

      if (!bookInfo) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, endpoint));
      }

      return ok({
        id: "" as unknown as BookId,
        identifier: identifier,
        url: "",
        title: bookInfo.title || "",
        author: bookInfo.authors?.join(", ") || "",
        publisher: bookInfo.publisher || "",
        publishedDate: bookInfo.date_published || "",
        description: "",
        libraryInfo: {
          existsIn: new Map(),
          opacLinks: new Map()
        }
      });
    } catch (error) {
      logAxiosError(error, "ISBNdb", `ISBN: ${identifier}`, logger);
      return err(convertToApiError(error, "ISBNdb", endpoint));
    }
  }
});

/**
 * NDL プロバイダーファクトリ
 */
export const createNDLProvider = (logger?: Logger): SingleProvider => ({
  config: {
    name: "NDL",
    supportsIdentifier: isIsbnIdentifier
  },
  fetchSingle: async (identifier: BookIdentifier) => {
    const endpoint = "https://ndlsearch.ndl.go.jp/api/opensearch";

    if (!isIsbnIdentifier(identifier)) {
      return err(new ApiError("サポートされていない識別子形式です", 400, endpoint));
    }

    try {
      const xmlParser = new XMLParser();

      const response: AxiosResponse<string> = await axios({
        method: "get",
        url: `${endpoint}?isbn=${identifier}`,
        responseType: "text"
      });

      const parsedResult = xmlParser.parse(response.data) as NdlResponseJson;
      const ndlResp = parsedResult.rss.channel;

      if (!("item" in ndlResp)) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, endpoint));
      }

      const bookinfo = Array.isArray(ndlResp.item) ? ndlResp.item[0] : ndlResp.item;

      if (!bookinfo) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, endpoint));
      }

      const bookTitle = bookinfo.title ?? "";
      const bookVolume = bookinfo["dcndl:volume"] ?? "";
      const bookSeries = bookinfo["dcndl:seriesTitle"] ?? "";
      const formattedTitle = `${bookTitle}${bookVolume ? " " + bookVolume : ""}${bookSeries ? " / " + bookSeries : ""}`;

      return ok({
        id: "" as unknown as BookId,
        identifier: identifier,
        url: "",
        title: formattedTitle,
        author: bookinfo.author ?? "",
        publisher: bookinfo["dc:publisher"] ?? "",
        publishedDate: bookinfo.pubDate ?? "",
        description: "",
        libraryInfo: {
          existsIn: new Map(),
          opacLinks: new Map()
        }
      });
    } catch (error) {
      logAxiosError(error, "NDL", `ISBN: ${identifier}`, logger);
      return err(convertToApiError(error, "NDL", endpoint));
    }
  }
});
