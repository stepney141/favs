import type { BookCollection, BookMode } from "@/domain/entities/Book";

export class KinokuniyaScraper {
  async enrich(mode: BookMode, books: BookCollection): Promise<BookCollection> {
    void mode;
    // TODO: implement Puppeteer-based description enrichment.
    return books;
  }
}
