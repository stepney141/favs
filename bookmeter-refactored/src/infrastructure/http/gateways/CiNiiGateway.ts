import type { Book } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class CiNiiGateway {
  constructor(private readonly http: HttpClient, private readonly appId: string) {}

  async checkOwnership(book: Book): Promise<Book> {
    void book;
    void this.appId;
    // TODO: query CiNii Books API for library ownership.
    return book;
  }
}
