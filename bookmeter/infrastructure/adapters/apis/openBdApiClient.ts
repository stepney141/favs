import axios from "axios";

import { failure, success } from "../../../domain/models/valueObjects";

import type { BiblioInfoProvider } from "../../../application/ports/output/biblioInfoProvider";
import type { Book, BookList } from "../../../domain/models/book";
import type { Result, BiblioinfoErrorStatus } from "../../../domain/models/valueObjects";

/**
 * OpenBD APIのレスポンス型定義
 */
namespace OpenBD {
  export type Summary = {
    isbn: string;
    title: string;
    volume: string;
    series: string;
    publisher: string;
    pubdate: string;
    cover: string;
    author: string;
  };

  export type CollateralDetail = {
    TextContent?: {
      TextType: string;
      ContentAudience: string;
      Text: string;
    }[];
  };

  export type BookData = {
    summary: Summary;
    onix: {
      CollateralDetail: CollateralDetail;
    };
  };

  export type Response = (BookData | null)[];
}

/**
 * OpenBD API クライアント
 * OpenBDから書誌情報を取得する
 */
export class OpenBdApiClient implements BiblioInfoProvider {
  /**
   * プロバイダー名
   */
  readonly name = "OpenBD";

  private readonly baseUrl: string;
  private readonly logPrefix: string;

  /**
   * コンストラクタ
   * @param baseUrl API基底URL
   * @param logPrefix ログプレフィックス
   */
  constructor(baseUrl = "https://api.openbd.jp/v1", logPrefix = "OpenBD API") {
    this.baseUrl = baseUrl;
    this.logPrefix = logPrefix;
  }

  /**
   * 書籍リストから書誌情報を一括取得する
   * @param bookList 書籍リスト
   * @returns 更新された書籍リスト
   */
  async fetchBulkBiblioInfo(bookList: BookList): Promise<Result<BookList>> {
    try {
      // ISBNのリストを取得
      const isbnList = Array.from(bookList.items.values())
        .map((book) => book.isbn.toString())
        .filter((isbn) => isbn.length === 10 || isbn.length === 13);

      if (isbnList.length === 0) {
        console.log(`${this.logPrefix}: 有効なISBNが見つかりません`);
        return success(bookList);
      }

      // OpenBD APIを呼び出し
      const apiUrl = `${this.baseUrl}/get?isbn=${isbnList.join(",")}`;

      console.log(`${this.logPrefix}: API呼び出し: ${apiUrl}`);
      const response = await axios.get<OpenBD.Response>(apiUrl);

      // 新しい書籍リストを作成
      let updatedBookList = bookList;

      // レスポンスを処理
      for (let i = 0; i < response.data.length; i++) {
        const openBdData = response.data[i];
        const isbn = isbnList[i];

        // 書籍を検索
        let book: Book | undefined;
        for (const b of bookList.items.values()) {
          if (b.isbn.toString() === isbn) {
            book = b;
            break;
          }
        }

        if (!book) continue;

        // データがnullの場合はスキップ
        if (openBdData === null) {
          console.log(`${this.logPrefix}: ${isbn} の情報が見つかりませんでした`);
          continue;
        }

        // 書籍情報を更新
        try {
          const updatedBook = this.updateBookWithOpenBdData(book, openBdData);
          updatedBookList = updatedBookList.add(updatedBook);
        } catch (error) {
          console.error(`${this.logPrefix}: ${isbn} の情報更新中にエラーが発生しました:`, error);
        }
      }

      return success(updatedBookList);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`${this.logPrefix}: 書誌情報の取得に失敗しました`));
    }
  }

  /**
   * 指定したISBNの書籍の詳細情報を取得する
   * @param isbn ISBN
   * @returns 取得結果
   */
  async fetchInfoByIsbn(isbn: string): Promise<Result<Partial<Book>, BiblioinfoErrorStatus>> {
    try {
      // OpenBD APIを呼び出し
      const apiUrl = `${this.baseUrl}/get?isbn=${isbn}`;
      const response = await axios.get<OpenBD.Response>(apiUrl);

      // データがない場合はエラーを返す
      if (response.data.length === 0 || response.data[0] === null) {
        return failure("Not_found_in_OpenBD");
      }

      const openBdData = response.data[0];
      const summary = openBdData.summary;

      // タイトル
      let title = summary.title;
      if (summary.volume && summary.volume !== "") {
        title = `${title} ${summary.volume}`;
      }
      if (summary.series && summary.series !== "") {
        title = `${title} (${summary.series})`;
      }

      // 説明文
      let description: string | undefined;
      if (openBdData.onix.CollateralDetail?.TextContent) {
        description = "";
        for (const text of openBdData.onix.CollateralDetail.TextContent) {
          description += (description ? "\n\n" : "") + text.Text;
        }
      }

      // 部分的な書籍情報を返す
      return success({
        title,
        author: summary.author,
        publisher: summary.publisher,
        publishedDate: summary.pubdate,
        description
      });
    } catch (error) {
      return failure("OpenBD_API_Error");
    }
  }

  /**
   * 書籍情報を補完する
   * @param book 補完対象の書籍
   * @returns 補完された書籍情報
   */
  async enrichBook(book: Book): Promise<Result<Book, BiblioinfoErrorStatus>> {
    try {
      const isbn = book.isbn.toString();

      // OpenBD APIを呼び出し
      const apiUrl = `${this.baseUrl}/get?isbn=${isbn}`;
      const response = await axios.get<OpenBD.Response>(apiUrl);

      // データがない場合は元の書籍を返す
      if (response.data.length === 0 || response.data[0] === null) {
        return success(book);
      }

      // 書籍情報を更新
      const updatedBook = this.updateBookWithOpenBdData(book, response.data[0]);
      return success(updatedBook);
    } catch (err) {
      console.error(`${this.logPrefix}: 書誌情報の取得に失敗しました:`, err);
      return success(book); // エラー時は元の書籍を返す
    }
  }

  /**
   * 単一の書籍の書誌情報を取得する（内部メソッド）
   * @param book 書籍
   * @returns 更新された書籍
   * @private
   */
  private async fetchInfo(book: Book): Promise<Result<Book>> {
    try {
      const isbn = book.isbn.toString();

      // OpenBD APIを呼び出し
      const apiUrl = `${this.baseUrl}/get?isbn=${isbn}`;
      const response = await axios.get<OpenBD.Response>(apiUrl);

      // データがない場合は元の書籍を返す
      if (response.data.length === 0 || response.data[0] === null) {
        return success(book);
      }

      // 書籍情報を更新
      const updatedBook = this.updateBookWithOpenBdData(book, response.data[0]);
      return success(updatedBook);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`${this.logPrefix}: 書誌情報の取得に失敗しました`));
    }
  }

  /**
   * OpenBDのデータで書籍情報を更新する
   * @param book 元の書籍
   * @param openBdData OpenBDのデータ
   * @returns 更新された書籍
   * @private
   */
  private updateBookWithOpenBdData(book: Book, openBdData: OpenBD.BookData): Book {
    const summary = openBdData.summary;

    // タイトル
    let title = summary.title || book.title;
    if (summary.volume && summary.volume !== "") {
      title = `${title} ${summary.volume}`;
    }
    if (summary.series && summary.series !== "") {
      title = `${title} (${summary.series})`;
    }

    // 説明文
    let description = book.description || "";
    if (openBdData.onix.CollateralDetail?.TextContent) {
      for (const text of openBdData.onix.CollateralDetail.TextContent) {
        description += (description ? "\n\n" : "") + text.Text;
      }
    }

    // 更新された書籍を返す
    return {
      ...book,
      title,
      author: summary.author || book.author,
      publisher: summary.publisher || book.publisher,
      publishedDate: summary.pubdate || book.publishedDate,
      description: description || undefined
    };
  }
}
