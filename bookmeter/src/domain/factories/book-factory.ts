import type { ASIN, BookmeterUrl, ISBN10 } from "../book-id";
import type { Book } from "../entities/book";

export interface CreateBookParams {
  bookmeterUrl: BookmeterUrl;
  isbnOrAsin: ISBN10 | ASIN;
  title?: string;
  author?: string;
  publisher?: string;
  publishedDate?: string;
}

/**
 * 新しいBookエンティティを作成する
 * 必須フィールド以外はデフォルト値で初期化される
 *
 * @param params - 書籍作成パラメータ
 * @returns 新しく作成されたBookエンティティ
 */
export function createNewBook(params: CreateBookParams): Book {
  return {
    ...params,
    title: params.title ?? "",
    author: params.author ?? "",
    publisher: params.publisher ?? "",
    publishedDate: params.publishedDate ?? "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    sophia_opac: "",
    utokyo_opac: "",
    sophiaMathlibOpac: "",
    description: ""
  };
}
