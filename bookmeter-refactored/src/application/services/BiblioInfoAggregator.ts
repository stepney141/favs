import type { BookCollection, BookMode } from "@/domain/entities/Book";

export interface BiblioInfoAggregator {
  enrich(books: BookCollection, mode: BookMode): Promise<BookCollection>;
}

export class NoopBiblioInfoAggregator implements BiblioInfoAggregator {
  async enrich(books: BookCollection): Promise<BookCollection> {
    return books;
  }
}
