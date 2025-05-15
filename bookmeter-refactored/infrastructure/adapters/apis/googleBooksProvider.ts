import axios from "axios";

import { convertToApiError, logAxiosError } from "../../utils/apiUtils";

import type { BiblioInfoProvider } from "@/application/ports/output/biblioInfoProvider";
import type { Book } from "@/domain/models/book";
import type { Result } from "@/domain/models/result";
import type { BiblioInfoSource, BookIdentifier, BookId } from "@/domain/models/valueObjects";

import { updateBook } from "@/domain/models/book";
import { ApiError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";
import { isIsbn10, isIsbn13 } from "@/domain/services/isbnService";

// GoogleBooks APIのレスポンス型定義
interface GoogleBooksVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
}

interface GoogleBooksItem {
  volumeInfo: GoogleBooksVolumeInfo;
}

interface GoogleBooksResponse {
  totalItems: number;
  items?: GoogleBooksItem[];
}

/**
 * Google Books API を使用した書誌情報プロバイダー
 * @link https://developers.google.com/books/docs/v1/reference/volumes/list?hl=en
 */
export class GoogleBooksProvider implements BiblioInfoProvider {
  private readonly logger: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
  };
  private readonly endpoint = "https://www.googleapis.com/books/v1/volumes";
  private readonly credential: string;

  constructor(
    credential: string,
    logger?: { info: (message: string, data?: object) => void; error: (message: string, data?: object) => void }
  ) {
    this.credential = credential;
    this.logger = logger || {
      info: console.log,
      error: console.error
    };
  }

  /**
   * このプロバイダーのソース名を取得
   */
  getSourceName(): BiblioInfoSource {
    return "GoogleBooks";
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
    // どの書籍もやや優先度高め
    return 60;
  }

  /**
   * 書籍の識別子（ISBN）から書誌情報を取得
   */
  async fetchBookInfo(identifier: BookIdentifier): Promise<Result<ApiError, Book>> {
    if (!this.supportsIdentifier(identifier)) {
      return err(new ApiError("サポートされていない識別子形式です", 400, this.endpoint));
    }

    try {
      const response = await axios<GoogleBooksResponse>({
        method: "get",
        url: `${this.endpoint}?q=isbn:${identifier}&key=${this.credential}`,
        responseType: "json"
      });

      const json = response.data;

      // 検索結果があるかチェック
      if (json.totalItems === 0 || !json.items || json.items.length === 0) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, this.endpoint));
      }

      // 最初のアイテムを取得
      const bookinfo = json.items[0].volumeInfo;
      const title = bookinfo.title || "";
      const subtitle = bookinfo.subtitle || "";
      const formattedTitle = `${title}${subtitle ? " " + subtitle : ""}`;

      return ok({
        id: "" as unknown as BookId, // 後で設定
        identifier: identifier,
        url: "", // 後で設定
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
      logAxiosError(error, "GoogleBooks", `ISBN: ${identifier}`, this.logger);
      return err(convertToApiError(error, "GoogleBooks", this.endpoint));
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
      logAxiosError(error, "GoogleBooks", `ISBN: ${book.identifier}`, this.logger);
      return err(convertToApiError(error, "GoogleBooks", this.endpoint));
    }
  }
}
