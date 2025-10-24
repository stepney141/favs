import type { BookList } from "../domain/types";

export type BookListMode = "wish" | "stacked";

export type ScrapeOptions = {
  requireLogin: boolean;
};

export interface BookListScraper {
  scrape(mode: BookListMode, options: ScrapeOptions): Promise<BookList>;
}

export interface BookListSnapshotStore {
  loadPrevious(mode: BookListMode): Promise<BookList | null>;
  save(mode: BookListMode, list: BookList): Promise<void>;
}

export interface BibliographyEnricher {
  enrich(list: BookList): Promise<BookList>;
}

export interface DescriptionEnricher {
  enrich(mode: BookListMode, list: BookList): Promise<BookList>;
}

export interface CsvExporter {
  export(mode: BookListMode, list: BookList): Promise<void>;
}

export interface BackupPublisher {
  publish(): Promise<void>;
}
