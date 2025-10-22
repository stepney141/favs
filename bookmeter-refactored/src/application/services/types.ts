import type { BookCollection, BookMode } from "@/domain/entities/Book";

export interface ScrapingService {
  fetch(mode: BookMode, userId?: string): Promise<BookCollection>;
  enrichDescriptions?(mode: BookMode, books: BookCollection): Promise<BookCollection>;
}
