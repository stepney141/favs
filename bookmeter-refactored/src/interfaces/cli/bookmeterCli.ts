import { NoopBiblioInfoAggregator } from "@/application/services/BiblioInfoAggregator";
import { SyncBookmeterUseCase } from "@/application/usecases/SyncBookmeterUseCase";
import { BookListDiffService } from "@/domain/services/BookListDiffService";
import { FileCsvExporter } from "@/infrastructure/export/CsvExporter";
import { SqliteBookRepository } from "@/infrastructure/persistence/SqliteBookRepository";
import { BookmeterScraper } from "@/infrastructure/scraping/BookmeterScraper";
import { EnvConfig } from "@/shared/config/EnvConfig";
import { ConsoleLogger } from "@/shared/logging/ConsoleLogger";
import { SystemClock } from "@/shared/time/Clock";

export async function runCli(argv: string[]): Promise<number> {
  const [, , modeArg] = argv;
  if (modeArg !== "wish" && modeArg !== "stacked") {
    console.error("Usage: bookmeter <wish|stacked>");
    return 1;
  }

  const config = new EnvConfig();
  const logger = new ConsoleLogger(config.bookmeter.jobName);
  const clock = new SystemClock();

  const browserFactory = async () => {
    const puppeteer = await import("puppeteer-extra");
    const browser = await puppeteer.default.launch({
      headless: config.browser.headless,
      args: config.browser.chromeArgs,
      slowMo: config.browser.slowMoMs
    });
    return browser;
  };

  const scrapingService = new BookmeterScraper(browserFactory);
  const repository = new SqliteBookRepository(config.storage.sqlitePath);
  const csvExporter = new FileCsvExporter((mode) => `./csv/${mode}.csv`);
  const diffService = new BookListDiffService();
  const aggregator = new NoopBiblioInfoAggregator();

  const useCase = new SyncBookmeterUseCase({
    scrapingService,
    repository,
    csvExporter,
    diffService,
    aggregator,
    logger,
    clock
  });

  await useCase.execute({ mode: modeArg });
  return 0;
}
