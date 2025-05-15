import axios from "axios";

// XMLParserは使用しないので削除
import { convertToApiError, logAxiosError } from "../../utils/apiUtils";

import type { BiblioInfoProvider } from "@/application/ports/output/biblioInfoProvider";
import type { Book } from "@/domain/models/book";
import type { Result } from "@/domain/models/result";
import type { BiblioInfoSource, BookIdentifier, BookId } from "@/domain/models/valueObjects";

import { updateBook } from "@/domain/models/book";
import { ApiError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";
import { isIsbn10, isIsbn13 } from "@/domain/services/isbnService";

// OpenBD APIのレスポンス型定義
// namespaceは使わずにinterfaceとtypeを直接定義
interface OpenBDSummary {
  isbn: string;
  title: string;
  volume: string;
  series: string;
  publisher: string;
  pubdate: string;
  author: string;
  cover: string;
}

interface OpenBDBookInfo {
  summary: OpenBDSummary;
}

type OpenBDResponse = (OpenBDBookInfo | null)[];

/**
 * OpenBD API を使用した書誌情報プロバイダー
 */
export class OpenBDProvider implements BiblioInfoProvider {
  private readonly logger: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
  };
  private readonly endpoint = "https://api.openbd.jp/v1/get";

  constructor(logger?: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
  }) {
    this.logger = logger || {
      info: console.log,
      error: console.error
    };
  }

  /**
   * このプロバイダーのソース名を取得
   */
  getSourceName(): BiblioInfoSource {
    return "OpenBD";
  }

  /**
   * 指定された書籍識別子をサポートしているかチェック
   */
  supportsIdentifier(identifier: BookIdentifier): boolean {
    // ISBN（10桁または13桁）のみサポート、ASINはサポート外
    return isIsbn10(identifier) || isIsbn13(identifier);
  }

  /**
   * プロバイダーの優先度を取得
   */
  getPriority(identifier: BookIdentifier): number {
    // 日本語書籍（ISBNが4で始まる）は優先度高め
    if (isIsbn10(identifier) && identifier[0] === "4") {
      return 90; // 日本語書籍は高優先度
    }
    return 50; // デフォルト優先度
  }

  /**
   * OpenBD APIから書籍情報を一括取得
   */
  async fetchBulkBookInfo(identifiers: BookIdentifier[]): Promise<Result<ApiError, Map<string, Book>>> {
    if (identifiers.length === 0) {
      return ok(new Map());
    }

    try {
      const response = await axios<OpenBDResponse>({
        method: "get",
        url: `${this.endpoint}?isbn=${identifiers.join(",")}`,
        responseType: "json"
      });

      const results = new Map<string, Book>();

      for (let i = 0; i < identifiers.length; i++) {
        const identifier = identifiers[i];
        const bookInfo = response.data[i];

        if (bookInfo) {
          const summary = bookInfo.summary;
          const title = summary.title || "";
          const volume = summary.volume || "";
          const series = summary.series || "";
          const bookTitle = `${title}${volume ? ` ${volume}` : ""}${series ? ` (${series})` : ""}`;

          results.set(identifier, {
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
          });
        }
      }

      return ok(results);
    } catch (error) {
      this.logger.error(`OpenBD API呼び出し中にエラーが発生しました`, {
        error: error instanceof Error ? error.message : String(error),
        endpoint: this.endpoint
      });
      return err(convertToApiError(error, "OpenBD", this.endpoint));
    }
  }

  /**
   * 書籍の識別子（ISBN/ASIN）から書誌情報を取得
   */
  async fetchBookInfo(identifier: BookIdentifier): Promise<Result<ApiError, Book>> {
    if (!this.supportsIdentifier(identifier)) {
      return err(new ApiError("サポートされていない識別子形式です", 400, this.endpoint));
    }

    try {
      const response = await axios<OpenBDResponse>({
        method: "get",
        url: `${this.endpoint}?isbn=${identifier}`,
        responseType: "json"
      });

      const bookInfo = response.data[0];

      if (!bookInfo) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, this.endpoint));
      }

      const summary = bookInfo.summary;
      const title = summary.title || "";
      const volume = summary.volume || "";
      const series = summary.series || "";
      const bookTitle = `${title}${volume ? ` ${volume}` : ""}${series ? ` (${series})` : ""}`;

      return ok({
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
      });
    } catch (error) {
      logAxiosError(error, "OpenBD", `ISBN: ${identifier}`, this.logger);
      return err(convertToApiError(error, "OpenBD", this.endpoint));
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
      const result = await this.fetchBookInfo(book.identifier);

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
      logAxiosError(error, "OpenBD", `ISBN: ${book.identifier}`, this.logger);
      return err(convertToApiError(error, "OpenBD", this.endpoint));
    }
  }
}
