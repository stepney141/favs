import type { BiblioInfoAggregator } from "@/application/services/BiblioInfoAggregator";
import type { ScrapingService } from "@/application/services/types";
import type { BookRepository, CsvExporter, CsvFallbackExporter } from "@/domain/repositories/BookRepository";
import type { BookListDiffService } from "@/domain/services/BookListDiffService";
import type { FirebaseUploader } from "@/infrastructure/messaging/FirebaseUploader";
import type { Logger } from "@/shared/logging/Logger";
import type { Clock } from "@/shared/time/Clock";

import { type BookMode } from "@/domain/entities/Book";

export interface SyncOptions {
  mode: BookMode;
  userId?: string;
  skipDiffCheck?: boolean;
  skipBiblioInfo?: boolean;
  noRemoteCheck?: boolean;
}

export interface SyncBookmeterDependencies {
  scrapingService: ScrapingService;
  repository: BookRepository;
  csvExporter: CsvExporter;
  fallbackExporter: CsvFallbackExporter;
  diffService: BookListDiffService;
  aggregator: BiblioInfoAggregator;
  firebaseUploader: FirebaseUploader;
  logger: Logger;
  clock: Clock;
}

export class SyncBookmeterUseCase {
  constructor(private readonly deps: SyncBookmeterDependencies) {}

  async execute(options: SyncOptions): Promise<void> {
    const { mode, skipDiffCheck = false, skipBiblioInfo = false, noRemoteCheck = false } = options;
    const start = this.deps.clock.now();
    this.deps.logger.info(`Sync started at ${start.toISOString()} for mode=${mode}`);

    const baseList = noRemoteCheck
      ? await this.deps.repository.load(mode)
      : await this.deps.scrapingService.fetch(mode, options.userId);

    const previousList = await this.deps.repository.load(mode);

    const diff = this.deps.diffService.compare(previousList, baseList, skipDiffCheck);
    this.deps.logger.info(`Diff result: added=${diff.added.length}, removed=${diff.removed.length}`);

    if (!diff.hasChanges) {
      this.deps.logger.info("No changes detected. Aborting sync.");
      return;
    }

    const enrichedList = skipBiblioInfo ? baseList : await this.deps.aggregator.enrich(baseList, mode);

    try {
      await this.deps.repository.save(mode, enrichedList);
      await this.deps.repository.removeMissing(mode, enrichedList);
      await this.deps.csvExporter.export(mode, enrichedList);
      await this.deps.firebaseUploader.uploadSqliteSnapshot();
    } catch (error) {
      this.deps.logger.error("Primary export failed; attempting fallback CSV", error);
      const fallbackRows = Array.from(enrichedList.values());
      await this.deps.fallbackExporter.exportFallback(mode, fallbackRows);
    }

    this.deps.logger.info("Sync completed successfully.");
  }
}
