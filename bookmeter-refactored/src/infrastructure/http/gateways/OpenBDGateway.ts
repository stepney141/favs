import type { BookCollection } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class OpenBDGateway {
  constructor(private readonly http: HttpClient) {}

  async fetchBulk(books: BookCollection): Promise<BookCollection> {
    void books;
    // TODO: call OpenBD bulk API and merge results.
    return books;
  }
}
