
import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class NDLGateway implements SingleBookGateway {
  constructor(private readonly http: HttpClient) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    void book;
    void this.http;
    // TODO: query National Diet Library OpenSearch API.
    return book;
  }
}
