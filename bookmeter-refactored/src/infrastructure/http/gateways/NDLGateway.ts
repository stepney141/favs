import type { Book } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class NDLGateway {
  constructor(private readonly http: HttpClient) {}

  async search(book: Book): Promise<Book> {
    void book;
    // TODO: query National Diet Library OpenSearch API.
    return book;
  }
}
