
import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class CiNiiGateway implements SingleBookGateway {
  constructor(private readonly http: HttpClient, private readonly appId: string) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    void book;
    void this.http;
    void this.appId;
    // TODO: query CiNii Books API for library ownership.
    return book;
  }
}
