import type { Book } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class MathLibCatalogGateway {
  constructor(private readonly http: HttpClient) {}

  async enrich(book: Book): Promise<Book> {
    void book;
    void this.http;
    // TODO: download PDFs, extract ISBN list, and update book description/ownership.
    return book;
  }
}
