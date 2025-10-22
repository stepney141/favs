
import type { BulkBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { BookCollection, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";

export class OpenBDGateway implements BulkBookGateway {
  constructor(private readonly http: HttpClient) {}

  async enrich(collection: BookCollection, _mode: BookMode): Promise<BookCollection> {
    void this.http;
    // TODO: call OpenBD bulk API and merge results.
    return collection;
  }
}
