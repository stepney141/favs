import type { CollectionGateway } from "@/application/services/BiblioInfoAggregator";
import type { BookMode } from "@/domain/entities/Book";
import type { Logger } from "@/shared/logging/Logger";
import type { Browser, Page } from "puppeteer";

import { BookCollection } from "@/domain/entities/Book";
import { convertIsbn10To13, isAsin, isIsbn10, routeIsbn10 } from "@/domain/services/IsbnService";
import { sleep } from "@/shared/utils/Delay";

const KINOKUNIYA_XPATH = {
  publisherInfo: '//div[@class="career_box"]/h3[text()="出版社内容情報"]/following-sibling::p[1]',
  description: '//div[@class="career_box"]/h3[text()="内容説明"]/following-sibling::p[1]',
  tableOfContents: '//div[@class="career_box"]/h3[text()="目次"]/following-sibling::p[1]'
} as const;

export class KinokuniyaScraper implements CollectionGateway {
  constructor(
    private readonly browserFactory: () => Promise<Browser>,
    private readonly logger: Logger
  ) {}

  async enrich(collection: BookCollection, _mode: BookMode): Promise<BookCollection> {
    const targets = Array.from(collection.values()).filter((book) => {
      const id = book.isbnOrAsin;
      return Boolean(id) && isIsbn10(id) && !isAsin(id) && (!book.description || book.description.trim().length === 0);
    });

    if (targets.length === 0) {
      return collection;
    }

    const updated = new BookCollection(collection.entries());

    const browser = await this.browserFactory();
    try {
      const page = await browser.newPage();
      for (const book of targets) {
        try {
          const isbn10 = book.isbnOrAsin;
          if (!isbn10) continue;

          const url = this.buildKinokuniyaUrl(isbn10);
          const description = await this.fetchDescription(page, url);
          updated.upsert({ ...book, description });
          await sleep(500);
        } catch (error) {
          this.logger.error(`Kinokuniya scraping failed for ${book.isbnOrAsin}`, error);
        }
      }
      await page.close();
    } finally {
      await browser.close();
    }

    return updated;
  }

  private buildKinokuniyaUrl(isbn10: string): string {
    const isbn13 = convertIsbn10To13(isbn10);
    return routeIsbn10(isbn10) === "Japan"
      ? `https://www.kinokuniya.co.jp/f/dsg-01-${isbn13}`
      : `https://www.kinokuniya.co.jp/f/dsg-02-${isbn13}`;
  }

  private async fetchDescription(page: Page, url: string): Promise<string> {
    await page.goto(url, { waitUntil: "networkidle2" });
    await sleep(1000);

    const contents: string[] = [];
    for (const xpath of Object.values(KINOKUNIYA_XPATH)) {
      const text = await page.evaluate((xp) => {
        const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = result.singleNodeValue as HTMLElement | null;
        return node?.textContent ?? "";
      }, xpath);
      if (text && text.trim()) {
        contents.push(text.trim());
      }
    }

    return contents.join("\n");
  }
}
