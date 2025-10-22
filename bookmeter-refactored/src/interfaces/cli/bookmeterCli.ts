import { DefaultBiblioInfoAggregator } from "@/application/services/BiblioInfoAggregator";
import { SyncBookmeterUseCase } from "@/application/usecases/SyncBookmeterUseCase";
import { BookListDiffService } from "@/domain/services/BookListDiffService";
import { FileCsvExporter as CsvExporter } from "@/infrastructure/export/CsvExporter";
import { AxiosHttpClient } from "@/infrastructure/http/HttpClient";
import { CiNiiGateway } from "@/infrastructure/http/gateways/CiNiiGateway";
import { GoogleBooksGateway } from "@/infrastructure/http/gateways/GoogleBooksGateway";
import { ISBNdbGateway } from "@/infrastructure/http/gateways/ISBNdbGateway";
import { MathLibCatalogGateway } from "@/infrastructure/http/gateways/MathLibCatalog";
import { NDLGateway } from "@/infrastructure/http/gateways/NDLGateway";
import { OpenBDGateway } from "@/infrastructure/http/gateways/OpenBDGateway";
import { SqliteBookRepository } from "@/infrastructure/persistence/SqliteBookRepository";
import { BookmeterScraper } from "@/infrastructure/scraping/BookmeterScraper";
import { KinokuniyaScraper } from "@/infrastructure/scraping/KinokuniyaScraper";
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
  const csvExporter = new CsvExporter((mode) => `./csv/${mode}.csv`);
  const diffService = new BookListDiffService();

  const httpClient = new AxiosHttpClient();
  const openbdGateway = new OpenBDGateway(httpClient, logger);
  const isbnDbGateway = new ISBNdbGateway(httpClient, config.api.isbnDbApiKey, logger);
  const ndlGateway = new NDLGateway(httpClient, logger);
  const googleBooksGateway = new GoogleBooksGateway(httpClient, config.api.googleBooksApiKey);
  const ciNiiGateway = new CiNiiGateway(httpClient, config.api.ciniiAppId);
  const mathLibGateway = new MathLibCatalogGateway(httpClient);
  const kinokuniyaGateway = new KinokuniyaScraper();

  const aggregator = new DefaultBiblioInfoAggregator({
    bulkGateways: [openbdGateway],
    singleGateways: [isbnDbGateway, ndlGateway, googleBooksGateway, ciNiiGateway],
    collectionGateways: [mathLibGateway, kinokuniyaGateway],
    logger,
    concurrency: 5
  });

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
