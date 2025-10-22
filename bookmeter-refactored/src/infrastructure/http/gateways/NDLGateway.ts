import { XMLParser } from "fast-xml-parser";

import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";
import type { Logger } from "@/shared/logging/Logger";

import { isAsin } from "@/domain/services/IsbnService";

const parser = new XMLParser();

const BASE_URL = "https://ndlsearch.ndl.go.jp/api/opensearch";

type NdlItem = {
  title?: string;
  author?: string;
  "dcndl:seriesTitle"?: string;
  "dcndl:volume"?: string;
  "dc:publisher"?: string;
  pubDate?: string;
};

type NdlResponse = {
  rss?: {
    channel?: {
      item?: NdlItem | NdlItem[];
    };
  };
};

export class NDLGateway implements SingleBookGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger
  ) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    try {
      const isbnQuery = this.buildIsbnQuery(book);
      if (isbnQuery) {
        const found = await this.search(book, isbnQuery);
        if (found) return found;
      }

      const fallbackQuery = this.buildFallbackQuery(book);
      if (fallbackQuery) {
        const foundByFallback = await this.search(book, fallbackQuery);
        if (foundByFallback) return foundByFallback;
      }

      return this.withStatus(book, "Not_found_in_NDL");
    } catch (error) {
      this.logger.error("NDL API error", error);
      return this.withStatus(book, "NDL_API_Error");
    }
  }

  private buildIsbnQuery(book: Book): string | null {
    const identifier = book.isbnOrAsin;
    if (!identifier || isAsin(identifier)) {
      return null;
    }
    return `isbn=${encodeURIComponent(identifier)}`;
  }

  private buildFallbackQuery(book: Book): string | null {
    const title = book.title?.trim();
    const author = book.author?.trim();
    if (!title && !author) {
      return null;
    }
    const query = [title, author].filter(Boolean).join(" ");
    return `any=${encodeURIComponent(query)}`;
  }

  private async search(book: Book, query: string): Promise<Book | null> {
    const response = await this.http.get<string>(`${BASE_URL}?${query}`, { responseType: "text" });
    const parsed = parser.parse(response.data) as NdlResponse;

    const item = this.extractFirstItem(parsed);
    if (!item) {
      return null;
    }

    const baseTitle = item.title ?? book.title;
    const volume = item["dcndl:volume"] ?? "";
    const series = item["dcndl:seriesTitle"] ?? "";
    const fullTitle = `${baseTitle ?? ""}${volume ? ` ${volume}` : ""}${series ? ` / ${series}` : ""}`;

    return {
      ...book,
      title: fullTitle || book.title,
      author: item.author ?? book.author,
      publisher: item["dc:publisher"] ?? book.publisher,
      publishedDate: item.pubDate ?? book.publishedDate
    };
  }

  private extractFirstItem(response: NdlResponse): NdlItem | null {
    const channel = response.rss?.channel;
    if (!channel) return null;

    const { item } = channel;
    if (!item) return null;

    return Array.isArray(item) ? (item[0] ?? null) : item;
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
