
import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class ISBNdbGateway implements SingleBookGateway {
  constructor(private readonly http: HttpClient, private readonly credential: string) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    void book;
    void this.http;
    void this.credential;
    // TODO: call ISBNdb API with credential and map response.
    return book;
  }
}
