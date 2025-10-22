import type { BiblioInfoAggregator } from "@/application/services/BiblioInfoAggregator";
import type { ScrapingService } from "@/application/services/types";
import type { BookMode } from "@/domain/entities/Book";
import type { BookRepository, CsvExporter } from "@/domain/repositories/BookRepository";
import type { BookListDiffService } from "@/domain/services/BookListDiffService";
import type { Logger } from "@/shared/logging/Logger";
import type { Clock } from "@/shared/time/Clock";

import { BookCollection } from "@/domain/entities/Book";

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
  diffService: BookListDiffService;
  aggregator: BiblioInfoAggregator;
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
      ? new BookCollection()
      : await this.deps.scrapingService.fetch(mode, options.userId);

    const previousList = await this.deps.repository.load(mode);

    const diff = this.deps.diffService.compare(previousList, baseList, skipDiffCheck);
    this.deps.logger.info(`Diff result: added=${diff.added.length}, removed=${diff.removed.length}`);

    if (!diff.hasChanges) {
      this.deps.logger.info("No changes detected. Aborting sync.");
      return;
    }

    const enrichedList = skipBiblioInfo ? baseList : await this.deps.aggregator.enrich(baseList, mode);

    await this.deps.repository.save(mode, enrichedList);
    await this.deps.repository.removeMissing(mode, enrichedList);

    await this.deps.csvExporter.export(mode, enrichedList);

    this.deps.logger.info("Sync completed successfully.");
  }
}
