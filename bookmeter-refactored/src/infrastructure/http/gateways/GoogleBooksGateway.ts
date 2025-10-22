import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";
import type { Logger } from "@/shared/logging/Logger";

import { isAsin } from "@/domain/services/IsbnService";

type GoogleBooksVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
};

type GoogleBooksItem = {
  volumeInfo?: GoogleBooksVolumeInfo;
};

type GoogleBooksResponse = {
  totalItems: number;
  items?: GoogleBooksItem[];
};

export class GoogleBooksGateway implements SingleBookGateway {
  constructor(private readonly http: HttpClient, private readonly apiKey: string, private readonly logger: Logger) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    const identifier = book.isbnOrAsin;
    if (!identifier || isAsin(identifier)) {
      return book;
    }

    try {
      const response = await this.http.get<GoogleBooksResponse>(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(identifier)}&key=${this.apiKey}`
      );

      const payload = response.data;
      if (!payload || payload.totalItems === 0 || !payload.items || payload.items.length === 0) {
        return this.withStatus(book, "Not_found_in_GoogleBooks");
      }

      const info = payload.items[0]?.volumeInfo ?? {};
      const composedTitle = [info.title ?? "", info.subtitle ?? ""].filter(Boolean).join(" ");

      return {
        ...book,
        title: composedTitle || book.title,
        author: info.authors?.join(", ") ?? book.author,
        publisher: info.publisher ?? book.publisher,
        publishedDate: info.publishedDate ?? book.publishedDate
      };
    } catch (error) {
      this.logger.error("Google Books API error", error);
      return this.withStatus(book, "GoogleBooks_API_Error");
    }
  }

  private withStatus(book: Book, status: string): Book {
    return {
      ...book,
      title: status,
      author: status,
      publisher: status,
      publishedDate: status
    };
  }
}
