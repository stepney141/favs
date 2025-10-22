import type { Book, BookMode } from "@/domain/entities/Book";
import type { Logger } from "@/shared/logging/Logger";

import { BookCollection } from "@/domain/entities/Book";
import { PromiseQueue } from "@/shared/concurrency/PromiseQueue";

export interface BulkBookGateway {
  enrich(collection: BookCollection, mode: BookMode): Promise<BookCollection>;
}

export interface SingleBookGateway {
  enrich(book: Book, mode: BookMode): Promise<Book>;
}

export interface CollectionGateway {
  enrich(collection: BookCollection, mode: BookMode): Promise<BookCollection>;
}

export interface BiblioInfoAggregator {
  enrich(books: BookCollection, mode: BookMode): Promise<BookCollection>;
}

export type BiblioInfoAggregatorDeps = {
  bulkGateways: BulkBookGateway[];
  singleGateways: SingleBookGateway[];
  collectionGateways: CollectionGateway[];
  logger: Logger;
  concurrency?: number;
};

export class DefaultBiblioInfoAggregator implements BiblioInfoAggregator {
  private readonly concurrency: number;

  constructor(private readonly deps: BiblioInfoAggregatorDeps) {
    this.concurrency = deps.concurrency ?? 5;
  }

  async enrich(books: BookCollection, mode: BookMode): Promise<BookCollection> {
    const logger = this.deps.logger;
    logger.info(`Starting bibliographic enrichment for mode=${mode}`);

    let workingCollection = books;

    for (const gateway of this.deps.bulkGateways) {
      logger.debug?.(`Applying bulk gateway: ${gateway.constructor.name}`);
      workingCollection = await gateway.enrich(workingCollection, mode);
    }

    const results = new BookCollection();
    const queue = new PromiseQueue(this.concurrency);
    const tasks: Array<Promise<void>> = [];

    for (const [, book] of workingCollection.entries()) {
      tasks.push(
        queue.enqueue(async () => {
          let current = book;
          for (const gateway of this.deps.singleGateways) {
            logger.debug?.(`Applying single gateway ${gateway.constructor.name} for ${current.bookmeterUrl}`);
            current = await gateway.enrich(current, mode);
          }
          results.upsert(current);
        })
      );
    }

    await Promise.all(tasks);

    let enrichedCollection = results;
    if (results.size() === 0) {
      enrichedCollection = workingCollection;
    }

    for (const gateway of this.deps.collectionGateways) {
      logger.debug?.(`Applying collection gateway: ${gateway.constructor.name}`);
      enrichedCollection = await gateway.enrich(enrichedCollection, mode);
    }

    logger.info("Completed bibliographic enrichment.");
    return enrichedCollection;
  }
}

export class NoopBiblioInfoAggregator implements BiblioInfoAggregator {
  async enrich(books: BookCollection): Promise<BookCollection> {
    return books;
  }
}
