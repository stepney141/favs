import type { Book } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class GoogleBooksGateway {
  constructor(private readonly http: HttpClient, private readonly apiKey: string) {}

  async searchByIsbn(book: Book): Promise<Book> {
    void book;
    void this.apiKey;
    // TODO: call Google Books API.
    return book;
  }
}
