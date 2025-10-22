export type BookMode = "wish" | "stacked";

export interface Book {
  bookmeterUrl: string;
  isbnOrAsin: string;
  title: string;
  author: string;
  publisher: string;
  publishedDate: string;
  existInSophia: "Yes" | "No" | "Error";
  existInUTokyo: "Yes" | "No" | "Error";
  sophiaOpac: string;
  utokyoOpac: string;
  sophiaMathlibOpac: string;
  description: string;
}

export class BookCollection {
  private readonly books: Map<string, Book>;

  constructor(entries?: Iterable<[string, Book]>) {
    this.books = new Map(entries);
  }

  entries(): IterableIterator<[string, Book]> {
    return this.books.entries();
  }

  toMap(): Map<string, Book> {
    return new Map(this.books);
  }

  size(): number {
    return this.books.size;
  }

  getByUrl(url: string): Book | undefined {
    return this.books.get(url);
  }

  upsert(book: Book): void {
    this.books.set(book.bookmeterUrl, book);
  }
}
