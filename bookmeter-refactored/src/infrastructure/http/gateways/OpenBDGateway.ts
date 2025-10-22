import type { BulkBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";
import type { Logger } from "@/shared/logging/Logger";

import { BookCollection } from "@/domain/entities/Book";

type OpenBDSummary = {
  isbn: string;
  title: string;
  volume: string;
  series: string;
  publisher: string;
  pubdate: string;
  cover: string;
  author: string;
};

type OpenBDResponseItem = {
  summary: OpenBDSummary;
  onix: {
    CollateralDetail?: {
      TextContent?: {
        TextType: string;
        ContentAudience: string;
        Text: string;
      }[];
    };
  };
} | null;

type OpenBDResponse = OpenBDResponseItem[];

export class OpenBDGateway implements BulkBookGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger
  ) {}

  async enrich(collection: BookCollection, _mode: BookMode): Promise<BookCollection> {
    const targets = Array.from(collection.entries()).filter(([, book]) => Boolean(book.isbnOrAsin));
    if (targets.length === 0) {
      return collection;
    }

    const isbnList = targets.map(([, book]) => book.isbnOrAsin);
    const query = isbnList.join(",");

    try {
      const response = await this.http.get<OpenBDResponse>(`https://api.openbd.jp/v1/get?isbn=${query}`);
      const data = response.data ?? [];

      const updated = new BookCollection(collection.entries());

      targets.forEach(([url, book], index) => {
        const item = data[index];
        if (item === undefined) {
          updated.upsert(this.withStatus(book, "Not_found_in_OpenBD"));
          return;
        }

        if (item === null) {
          updated.upsert(this.withStatus(book, "Not_found_in_OpenBD"));
          return;
        }

        const summary = item.summary;
        const composedTitle = `${summary.title ?? ""}${summary.volume ? ` ${summary.volume}` : ""}${summary.series ? ` (${summary.series})` : ""}`;

        const enriched: Book = {
          ...book,
          bookmeterUrl: url,
          isbnOrAsin: book.isbnOrAsin,
          title: composedTitle,
          author: summary.author ?? "",
          publisher: summary.publisher ?? "",
          publishedDate: summary.pubdate ?? "",
          description: book.description
        };

        updated.upsert(enriched);
      });

      return updated;
    } catch (error) {
      this.logger.error("OpenBD API error", error);
      return collection;
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
