
import type { CollectionGateway } from "@/application/services/BiblioInfoAggregator";
import type { BookCollection, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class MathLibCatalogGateway implements CollectionGateway {
  constructor(private readonly http: HttpClient) {}

  async enrich(collection: BookCollection, _mode: BookMode): Promise<BookCollection> {
    void this.http;
    // TODO: download PDFs, extract ISBN list, and update book ownership within collection.
    return collection;
  }
}
