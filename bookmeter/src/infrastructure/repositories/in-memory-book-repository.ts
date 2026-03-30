import type { BookmeterUrl } from "../../domain/book-id";
import type { Book } from "../../domain/entities/book";
import type { BookCollectionMode, BookRepository } from "../../domain/repositories/bookRepository";

/**
 * インメモリでBookを管理するRepository実装
 */
export class InMemoryBookRepository implements BookRepository {
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

  getMode(): BookCollectionMode {
    return this.mode;
  }
}

/**
 * BookRepositoryのファクトリー関数
 */
export function createBookRepository(
  mode: BookCollectionMode,
  entries?: Iterable<[BookmeterUrl, Book]>
): BookRepository {
  return new InMemoryBookRepository(mode, entries);
}
