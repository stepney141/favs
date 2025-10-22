import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";
import type { Logger } from "@/shared/logging/Logger";

const ISBNDB_API_URI = "https://api2.isbndb.com";

type ISBNdbBook = {
  title?: string;
  authors?: string[];
  publisher?: string;
  date_published?: string;
};

type ISBNdbSuccessResponse = {
  book: ISBNdbBook;
};

type ISBNdbErrorResponse = {
  errorType: string;
  errorMessage: string;
};

export class ISBNdbGateway implements SingleBookGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly credential: string,
    private readonly logger: Logger
  ) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    const isbn = book.isbnOrAsin;
    if (!isbn) {
      return book;
    }

    try {
      const response = await this.http.get<ISBNdbSuccessResponse | ISBNdbErrorResponse>(
        `${ISBNDB_API_URI}/book/${isbn}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: this.credential
          },
          validateStatus: (status) => (status >= 200 && status < 300) || status === 404
        }
      );

      if ("book" in response.data) {
        const payload = response.data.book;
        return {
          ...book,
          title: payload.title ?? book.title,
          author: payload.authors?.join(", ") ?? book.author,
          publisher: payload.publisher ?? book.publisher,
          publishedDate: payload.date_published ?? book.publishedDate
        };
      }

      return this.withStatus(book, "Not_found_in_ISBNdb");
    } catch (error) {
      this.logger.error("ISBNdb API error", error);
      return this.withStatus(book, "ISBNdb_API_Error");
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
