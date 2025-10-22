import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Book, BookMode } from "@/domain/entities/Book";
import type { CsvFallbackExporter } from "@/domain/repositories/BookRepository";

export class FallbackCsvExporter implements CsvFallbackExporter {
  constructor(private readonly resolver: (mode: BookMode) => string) {}

  async exportFallback(mode: BookMode, books: Iterable<Book>): Promise<void> {
    const filePath = this.resolver(mode);
    const dir = path.dirname(filePath);
    if (dir && dir !== ".") {
      await mkdir(dir, { recursive: true });
    }

    const rows = Array.from(books).map(({ description, ...rest }) => ({ ...rest }));
    if (rows.length === 0) {
      await writeFile(filePath, "", "utf-8");
      return;
    }

    const header = Object.keys(rows[0]).join(",");
    const lines = rows.map((row) => Object.values(row).join(","));
    await writeFile(filePath, [header, ...lines].join("\n"), "utf-8");
  }
}
