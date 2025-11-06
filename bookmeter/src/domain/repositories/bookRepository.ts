import type { BookmeterUrl } from "../book-id";
import type { Book } from "../entities/book";

export type BookCollectionMode = "wish" | "stacked";

export interface BookRepository {
  keys(): IterableIterator<BookmeterUrl>;
  entries(): IterableIterator<[BookmeterUrl, Book]>;
  values(): IterableIterator<Book>;
  toMap(): Map<BookmeterUrl, Book>;
  size(): number;
  getByUrl(url: BookmeterUrl): Book | undefined;

  /**
   * 書籍を追加または更新する
   */
  upsert(book: Book): void;
}
