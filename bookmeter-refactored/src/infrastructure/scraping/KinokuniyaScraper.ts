import type { CollectionGateway } from "@/application/services/BiblioInfoAggregator";
import type { BookCollection, BookMode } from "@/domain/entities/Book";

export class KinokuniyaScraper implements CollectionGateway {
  async enrich(collection: BookCollection, mode: BookMode): Promise<BookCollection> {
    void mode;
    // TODO: implement Puppeteer-based description enrichment.
    return collection;
  }
}
