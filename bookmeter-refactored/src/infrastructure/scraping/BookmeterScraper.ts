
import type { ScrapingService } from "@/application/services/types";
import type { BookMode } from "@/domain/entities/Book";
import type { Browser } from "puppeteer";

import { BookCollection } from "@/domain/entities/Book";

export class BookmeterScraper implements ScrapingService {
  constructor(private readonly browserFactory: () => Promise<Browser>) {}

  async fetch(mode: BookMode, userId?: string): Promise<BookCollection> {
    // TODO: implement Puppeteer scraping logic.
    void mode;
    void userId;
    const browser = await this.browserFactory();
    await browser.close();
    return new BookCollection();
  }
}
