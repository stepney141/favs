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

// ISBNdb APIのレスポンス型定義
interface IsbnDbBook {
  title: string;
  authors?: string[];
  publisher?: string;
  date_published?: string;
}

interface IsbnDbSingleResponse {
  book?: IsbnDbBook;
  errorMessage?: string;
}

/**
 * ISBNdb API を使用した書誌情報プロバイダー
 */
export class ISBNdbProvider implements BiblioInfoProvider {
  private readonly logger: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
  };
  private readonly endpoint = "https://api2.isbndb.com/book";
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
    return "ISBNdb";
  }

  /**
   * 指定された書籍識別子をサポートしているかチェック
   */
  supportsIdentifier(identifier: BookIdentifier): boolean {
    // ISBN（10桁または13桁）のみサポート
    return isIsbn10(identifier) || isIsbn13(identifier);
  }

  /**
   * プロバイダーの優先度を取得
   */
  getPriority(identifier: BookIdentifier): number {
    // 海外書籍は優先度高め、日本の書籍は優先度低め
    if (isIsbn10(identifier) && identifier[0] === "4") {
      return 40; // 日本語書籍は低優先度
    }
    return 80; // 海外書籍は高優先度
  }

  /**
   * 書籍の識別子（ISBN）から書誌情報を取得
   */
  async fetchBookInfo(identifier: BookIdentifier): Promise<Result<ApiError, Book>> {
    if (!this.supportsIdentifier(identifier)) {
      return err(new ApiError("サポートされていない識別子形式です", 400, this.endpoint));
    }

    try {
      const instance = axios.create({
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404
      });

      const response = await instance<IsbnDbSingleResponse>({
        method: "get",
        url: `${this.endpoint}/${identifier}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: this.credential
        },
        responseType: "json"
      });

      // エラーメッセージがあるか404の場合
      if (response.status === 404 || "errorMessage" in response.data) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, this.endpoint));
      }

      const bookInfo = response.data.book;

      if (!bookInfo) {
        return err(new ApiError("書籍情報が見つかりませんでした", 404, this.endpoint));
      }

      return ok({
        id: "" as unknown as BookId, // 後で設定
        identifier: identifier,
        url: "", // 後で設定
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
      logAxiosError(error, "ISBNdb", `ISBN: ${identifier}`, this.logger);
      return err(convertToApiError(error, "ISBNdb", this.endpoint));
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
      logAxiosError(error, "ISBNdb", `ISBN: ${book.identifier}`, this.logger);
      return err(convertToApiError(error, "ISBNdb", this.endpoint));
    }
  }
}
