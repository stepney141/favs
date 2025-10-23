import type { CollectionGateway } from "@/application/services/BiblioInfoAggregator";
import type { BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";
import type { Logger } from "@/shared/logging/Logger";

import { MATH_LIB_BOOKLIST, REGEX } from "@/domain/constants/BiblioConstants";
import { BookCollection } from "@/domain/entities/Book";
import { convertIsbn10To13, isIsbn10, isIsbn13, isAsin } from "@/domain/services/IsbnService";
import { extractTextFromPDF } from "@/shared/utils/Pdf";

export class MathLibCatalogGateway implements CollectionGateway {
  private isbnSet: Set<string> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger
  ) {}

  async enrich(collection: BookCollection, _mode: BookMode): Promise<BookCollection> {
    await this.ensureCatalogLoaded();
    if (!this.isbnSet) return collection;

    const updated = new BookCollection(collection.entries());

    for (const book of collection.values()) {
      const identifier = book.isbnOrAsin;
      if (!identifier || !isIsbn10(identifier) || isAsin(identifier)) {
        continue;
      }

      const isbn13 = convertIsbn10To13(identifier);
      if (this.isbnSet.has(identifier) || this.isbnSet.has(isbn13)) {
        updated.upsert({
          ...book,
          existInSophia: "Yes",
          sophiaMathlibOpac: `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn13}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`
        });
      }
    }

    return updated;
  }

  private async ensureCatalogLoaded(): Promise<void> {
    if (this.isbnSet !== null) return;

    const set = new Set<string>();

    for (const url of MATH_LIB_BOOKLIST.ja) {
      try {
        const response = await this.http.get<ArrayBuffer>(url, {
          responseType: "arraybuffer"
        });
        const data = new Uint8Array(response.data);
        for await (const page of extractTextFromPDF(data)) {
          const matches = page.matchAll(REGEX.isbn);
          for (const match of matches) {
            const rawValue = match[0];
            const value = rawValue.replace(/[-\s]/g, "");
            if (isIsbn10(value) || isIsbn13(value)) {
              set.add(value);
            }
          }
        }
      } catch (error) {
        this.logger.error("Failed to fetch Math Library catalog", error);
      }
    }

    this.isbnSet = set;
  }
}
