import type { BookId, BookIdentifier } from "./isbn";

/**
 * 書籍リストのタイプ
 * - wish: 読みたい本リスト
 * - stacked: 積読本リスト
 */
export type BookListType = "wish" | "stacked";

/**
 * 図書館タグ
 * 図書館を識別するためのタグ
 */
export type LibraryTag = "UTokyo" | "Sophia";

/**
 * 書誌情報のソース
 * 書誌情報を取得するソースを表す
 */
export type BiblioInfoSource = "OpenBD" | "ISBNdb" | "Amazon" | "NDL" | "GoogleBooks";

/**
 * 図書館情報
 * 書籍の図書館における所蔵状況と関連リンク
 */
export type LibraryInfo = {
  existsIn: ReadonlyMap<LibraryTag, boolean>;
  opacLinks: ReadonlyMap<LibraryTag, string>;
  mathLibOpacLink?: string;
};

/**
 * 書籍エンティティ
 * 書籍の基本情報を表す
 */
export type Book = {
  id: BookId;
  identifier: BookIdentifier;
  url: string;
  title: string;
  author: string;
  publisher: string;
  publishedDate: string;
  description: string;
  libraryInfo: LibraryInfo;
};

/**
 * 書籍リスト
 * 書籍URLをキーとする書籍のMap
 */
export type BookList = ReadonlyMap<string, Book>;

/**
 * 書籍を作成する
 * @param params 書籍のパラメータ
 * @returns 新しい書籍オブジェクト
 */
export function createBook(
  params: Readonly<{
    id: BookId;
    identifier: BookIdentifier;
    url: string;
    title: string;
    author: string;
    publisher?: string;
    publishedDate?: string;
    description?: string;
    libraryInfo?: Partial<LibraryInfo>;
  }>
): Book {
  return {
    id: params.id,
    identifier: params.identifier,
    url: params.url,
    title: params.title,
    author: params.author,
    publisher: params.publisher || "",
    publishedDate: params.publishedDate || "",
    description: params.description || "",
    libraryInfo: {
      existsIn: new Map(params.libraryInfo?.existsIn || []),
      opacLinks: new Map(params.libraryInfo?.opacLinks || []),
      mathLibOpacLink: params.libraryInfo?.mathLibOpacLink || ""
    }
  };
}

/**
 * 書籍を更新する
 * @param book 元の書籍
 * @param updates 更新するプロパティ
 * @returns 更新された新しい書籍オブジェクト
 */
export function updateBook(book: Readonly<Book>, updates: Partial<Book>): Book {
  return {
    ...book,
    ...updates,
    libraryInfo: updates.libraryInfo
      ? {
          existsIn: updates.libraryInfo.existsIn || book.libraryInfo.existsIn,
          opacLinks: updates.libraryInfo.opacLinks || book.libraryInfo.opacLinks,
          mathLibOpacLink: updates.libraryInfo.mathLibOpacLink || book.libraryInfo.mathLibOpacLink
        }
      : book.libraryInfo
  };
}

/**
 * 書籍リストを作成する
 * @param books 書籍の配列
 * @returns 書籍リスト
 */
export function createBookList(books: Book[]): BookList {
  return new Map(books.map((book) => [book.url, book]));
}

/**
 * 書籍リストに書籍を追加する
 * @param bookList 書籍リスト
 * @param book 追加する書籍
 * @returns 新しい書籍リスト
 */
export function addBook(bookList: BookList, book: Readonly<Book>): BookList {
  return new Map([...bookList.entries(), [book.url, book]]);
}

/**
 * 書籍リストから指定したURLの書籍を削除する
 * @param bookList 書籍リスト
 * @param url 削除する書籍のURL
 * @returns 新しい書籍リスト
 */
export function removeBook(bookList: BookList, url: string): BookList {
  const newList = new Map(bookList);
  newList.delete(url);
  return newList;
}

/**
 * 書籍リストを配列に変換する
 * @param bookList 書籍リスト
 * @returns 書籍の配列
 */
export function bookListToArray(bookList: BookList): Book[] {
  return Array.from(bookList.values());
}

/**
 * 書籍リストをフィルタリングする
 * @param bookList 書籍リスト
 * @param predicate フィルタ条件
 * @returns フィルタリングされた新しい書籍リスト
 */
export function filterBooks(bookList: BookList, predicate: (book: Readonly<Book>) => boolean): BookList {
  return new Map(Array.from(bookList.entries()).filter(([, book]) => predicate(book)));
}
