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

class BookCollection implements BookRepository {
  private readonly books: Map<BookmeterUrl, Book>;
  private readonly mode: BookCollectionMode;

  constructor(mode: BookCollectionMode, entries?: Iterable<[BookmeterUrl, Book]>) {
    this.books = new Map(entries);
    this.mode = mode;
  }

  keys(): IterableIterator<BookmeterUrl> {
    return this.books.keys();
  }

  entries(): IterableIterator<[BookmeterUrl, Book]> {
    return this.books.entries();
  }

  values(): IterableIterator<Book> {
    return this.books.values();
  }

  toMap(): Map<BookmeterUrl, Book> {
    return new Map(this.books);
  }

  size(): number {
    return this.books.size;
  }

  getByUrl(url: BookmeterUrl): Book | undefined {
    return this.books.get(url);
  }

  upsert(book: Book): void {
    this.books.set(book.bookmeterUrl, book);
  }
}

export const wishedBookCollection = new BookCollection("wish");
export const stackedBookCollection = new BookCollection("stacked");
