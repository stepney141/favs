import { promises as fs } from "node:fs";

import type { BookCollection, BookMode } from "@/domain/entities/Book";
import type { CsvExporter as CsvExporterPort } from "@/domain/repositories/BookRepository";

export class FileCsvExporter implements CsvExporterPort {
  constructor(private readonly resolver: (mode: BookMode) => string) {}

  async export(mode: BookMode, books: BookCollection): Promise<void> {
    const filePath = this.resolver(mode);
    const rows = Array.from(books.entries()).map(([url, book]) => ({ url, ...book }));
    const header = Object.keys(rows[0] ?? {}).join(",");
    const lines = rows.map((row) => Object.values(row).join(","));
    const payload = [header, ...lines].filter(Boolean).join("\n");
    await fs.writeFile(filePath, payload, "utf-8");
  }
}
