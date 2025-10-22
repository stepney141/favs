import type { BookCollection, BookMode } from "@/domain/entities/Book";


export interface BookRepository {
  load(mode: BookMode): Promise<BookCollection>;
  save(mode: BookMode, books: BookCollection): Promise<void>;
  removeMissing(mode: BookMode, books: BookCollection): Promise<void>;
}

export interface CsvExporter {
  export(mode: BookMode, books: BookCollection): Promise<void>;
}
