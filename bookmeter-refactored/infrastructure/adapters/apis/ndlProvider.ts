import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { convertToApiError, logAxiosError } from "../../utils/apiUtils";

import type { BiblioInfoProvider } from "@/application/ports/output/biblioInfoProvider";
import type { Book } from "@/domain/models/book";
import type { Result } from "@/domain/models/result";
import type { BiblioInfoSource, BookIdentifier, BookId } from "@/domain/models/valueObjects";

import { updateBook } from "@/domain/models/book";
import { ApiError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";
import { isIsbn10, isIsbn13 } from "@/domain/services/isbnService";

// NDL APIのレスポンス型定義
interface NdlItem {
  title?: string;
  "dcndl:volume"?: string;
  "dcndl:seriesTitle"?: string;
  author?: string;
  "dc:publisher"?: string;
  pubDate?: string;
}

interface NdlChannel {
  item?: NdlItem | NdlItem[];
}

interface NdlResponseJson {
  rss: {
    channel: NdlChannel;
  };
}

/**
 * 国立国会図書館 書誌検索APIを使用した書誌情報プロバイダー
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */
export class NdlProvider implements BiblioInfoProvider {
  private readonly logger: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
  };
  private readonly endpoint = "https://ndlsearch.ndl.go.jp/api/opensearch";
  private readonly xmlParser: XMLParser;

  constructor(logger?: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
  }) {
    this.logger = logger || {
      info: console.log,
      error: console.error
    };
    this.xmlParser = new XMLParser();
  }

  /**
   * このプロバイダーのソース名を取得
   */
  getSourceName(): BiblioInfoSource {
    return "NDL";
  }

  /**
   * 指定された書籍識別子をサポートしているかチェック
   */
  supportsIdentifier(identifier: BookIdentifier): boolean {
    // ISBN（10桁または13桁）をサポート
    return isIsbn10(identifier) || isIsbn13(identifier);
  }

  /**
   * プロバイダーの優先度を取得
   */
  getPriority(identifier: BookIdentifier): number {
    // 日本語書籍（ISBNが4で始まる）は優先度高め
    if (isIsbn10(identifier) && identifier[0] === "4") {
      return 85; // 日本語書籍は高優先度
    }
    return 40; // 海外書籍は低優先度
  }

  /**
   * 書籍の識別子（ISBN）から書誌情報を取得
   */
  async fetchBookInfo(identifier: BookIdentifier): Promise<Result<ApiError, Book>> {
    if (!this.supportsIdentifier(identifier)) {
      return err(new ApiError("サポートされていない識別子形式です", 400, this.endpoint));
    }

    return this.fetchBookInfoByIsbnOrTitle(identifier);
  }

  /**
   * ISBNまたはタイトルと著者で書籍情報を検索
   */
  private async fetchBookInfoByIsbnOrTitle(
    identifier: BookIdentifier,
    title?: string,
    author?: string
  ): Promise<Result<ApiError, Book>> {
    try {
      // クエリパラメータの構築
      let query: string;
      if (title && author) {
        // タイトルと著者で検索
        query = `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
      } else if (isIsbn10(identifier) || isIsbn13(identifier)) {
        // ISBNで検索
        query = `isbn=${identifier}`;
      } else {
        return err(new ApiError("有効な検索条件がありません", 400, this.endpoint));
      }

      // APIリクエスト
      const response = await axios({
        method: "get",
        url: `${this.endpoint}?${query}`,
        responseType: "text"
      });

      // XMLをJSONに変換
      const parsedResult = this.xmlParser.parse(response.data) as NdlResponseJson;
      const ndlResp = parsedResult.rss.channel;

      // 検索結果があるか確認
      if (!("item" in ndlResp)) {
        // ISBNで検索しても見つからなかった場合、タイトルと著者があればそれで再検索
        if (isIsbn10(identifier) || isIsbn13(identifier)) {
          if (title && author) {
            return this.fetchBookInfoByIsbnOrTitle(identifier, title, author);
          }
        }

        return err(new ApiError("書籍情報が見つかりませんでした", 404, this.endpoint));
      }

      // 検索結果の処理
      // 該当結果が単数か複数かによって、返却される値がObjectなのかArray<Object>なのか変わる
      const bookinfo = Array.isArray(ndlResp.item) ? ndlResp.item[0] : ndlResp.item;

      if (!bookinfo) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, this.endpoint));
      }

      const bookTitle = bookinfo.title ?? "";
      const bookVolume = bookinfo["dcndl:volume"] ?? "";
      const bookSeries = bookinfo["dcndl:seriesTitle"] ?? "";
      const formattedTitle = `${bookTitle}${bookVolume ? " " + bookVolume : ""}${bookSeries ? " / " + bookSeries : ""}`;

      return ok({
        id: "" as unknown as BookId, // 後で設定
        identifier: identifier,
        url: "", // 後で設定
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
      const context = title && author ? `Title: ${title}, Author: ${author}` : `ISBN: ${identifier}`;
      logAxiosError(error, "NDL", context, this.logger);
      return err(convertToApiError(error, "NDL", this.endpoint));
    }
  }

  /**
   * 書籍オブジェクトに書誌情報を追加・更新
   */
  async enhanceBook(book: Book): Promise<Result<ApiError, Book>> {
    if (!book.identifier || !this.supportsIdentifier(book.identifier)) {
      return ok(book); // 識別子がないか、サポート外の形式の場合は何もせず返す
    }

    try {
      // まずISBNで検索
      let result = await this.fetchBookInfo(book.identifier);

      // ISBNで見つからない場合はタイトルと著者で検索
      if (!result.isSuccess() && book.title && book.author) {
        result = await this.fetchBookInfoByIsbnOrTitle(book.identifier, book.title, book.author);
      }

      if (!result.isSuccess()) {
        return result;
      }

      const bookInfo = result.unwrap();

      // 既存の書籍情報を更新
      return ok(
        updateBook(book, {
          title: bookInfo.title || book.title,
          author: bookInfo.author || book.author,
          publisher: bookInfo.publisher || book.publisher,
          publishedDate: bookInfo.publishedDate || book.publishedDate,
          description: bookInfo.description || book.description
        })
      );
    } catch (error) {
      logAxiosError(error, "NDL", `ISBN: ${book.identifier}`, this.logger);
      return err(convertToApiError(error, "NDL", this.endpoint));
    }
  }
}
