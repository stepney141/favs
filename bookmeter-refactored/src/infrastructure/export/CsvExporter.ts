import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { unparse } from "papaparse";

import type { Book, BookCollection, BookMode } from "@/domain/entities/Book";
import type { CsvExporter as CsvExporterPort } from "@/domain/repositories/BookRepository";

import { CSV_EXPORT_COLUMNS } from "@/domain/constants/CsvColumns";

export class FileCsvExporter implements CsvExporterPort {
  constructor(private readonly resolver: (mode: BookMode) => string) {}

  async export(mode: BookMode, books: BookCollection): Promise<void> {
    const filePath = this.resolver(mode);
    const dir = path.dirname(filePath);
    if (dir && dir !== ".") {
      await mkdir(dir, { recursive: true });
    }

    const fields = CSV_EXPORT_COLUMNS[mode] as string[];
    const rows = Array.from(books.values()).map((book) => this.mapBookToRow(book, fields));
    const csv = unparse({ fields, data: rows });
    await writeFile(filePath, csv, "utf-8");
  }

  private mapBookToRow(book: Book, fields: readonly string[]): Record<string, string> {
    const source: Record<string, string> = {
      bookmeter_url: book.bookmeterUrl,
      isbn_or_asin: book.isbnOrAsin ?? "",
      book_title: book.title ?? "",
      author: book.author ?? "",
      publisher: book.publisher ?? "",
      published_date: book.publishedDate ?? "",
      exist_in_sophia: book.existInSophia,
      exist_in_uTokyo: book.existInUTokyo,
      sophia_opac: book.sophiaOpac ?? "",
      utokyo_opac: book.utokyoOpac ?? "",
      sophia_mathlib_opac: book.sophiaMathlibOpac ?? ""
    };

    const row: Record<string, string> = {};
    for (const field of fields) {
      row[field] = source[field] ?? "";
    }
    return row;
  }
}
