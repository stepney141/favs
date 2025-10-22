
import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class GoogleBooksGateway implements SingleBookGateway {
  constructor(private readonly http: HttpClient, private readonly apiKey: string) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    void book;
    void this.http;
    void this.apiKey;
    // TODO: call Google Books API.
    return book;
  }
}
