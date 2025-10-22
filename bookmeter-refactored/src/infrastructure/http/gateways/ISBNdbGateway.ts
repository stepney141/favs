import type { Book } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class ISBNdbGateway {
  constructor(private readonly http: HttpClient, private readonly credential: string) {}

  async fetch(book: Book): Promise<Book> {
    void book;
    void this.http;
    // TODO: call ISBNdb API with credential and map response.
    return book;
  }
}
