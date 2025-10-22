import { DefaultBiblioInfoAggregator } from "@/application/services/BiblioInfoAggregator";
import { SyncBookmeterUseCase } from "@/application/usecases/SyncBookmeterUseCase";
import { BookListDiffService } from "@/domain/services/BookListDiffService";
import { FileCsvExporter as CsvExporter } from "@/infrastructure/export/CsvExporter";
import { FallbackCsvExporter } from "@/infrastructure/export/FallbackCsvExporter";
import { AxiosHttpClient } from "@/infrastructure/http/HttpClient";
import { CiNiiGateway } from "@/infrastructure/http/gateways/CiNiiGateway";
import { GoogleBooksGateway } from "@/infrastructure/http/gateways/GoogleBooksGateway";
import { ISBNdbGateway } from "@/infrastructure/http/gateways/ISBNdbGateway";
import { MathLibCatalogGateway } from "@/infrastructure/http/gateways/MathLibCatalog";
import { NDLGateway } from "@/infrastructure/http/gateways/NDLGateway";
import { OpenBDGateway } from "@/infrastructure/http/gateways/OpenBDGateway";
import { FirebaseUploader } from "@/infrastructure/messaging/FirebaseUploader";
import { SqliteBookRepository } from "@/infrastructure/persistence/SqliteBookRepository";
import { BookmeterScraper } from "@/infrastructure/scraping/BookmeterScraper";
import { KinokuniyaScraper } from "@/infrastructure/scraping/KinokuniyaScraper";
import { EnvConfig } from "@/shared/config/EnvConfig";
import { ConsoleLogger } from "@/shared/logging/ConsoleLogger";
import { SystemClock } from "@/shared/time/Clock";

let stealthApplied = false;

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
    if (!stealthApplied) {
      const { default: StealthPlugin } = await import("puppeteer-extra-plugin-stealth");
      const stealth = StealthPlugin();
      stealth.enabledEvasions.delete("iframe.contentWindow");
      stealth.enabledEvasions.delete("navigator.plugins");
      stealth.enabledEvasions.delete("media.codecs");
      puppeteer.default.use(stealth);
      stealthApplied = true;
    }
    const browser = await puppeteer.default.launch({
      headless: config.browser.headless,
      args: config.browser.chromeArgs,
      slowMo: config.browser.slowMoMs
    });
    return browser;
  };

  const scrapingService = new BookmeterScraper(
    browserFactory,
    {
      account: config.bookmeter.account,
      password: config.bookmeter.password,
      baseUri: config.bookmeter.baseUri,
      defaultUserId: config.bookmeter.defaultUserId
    },
    logger
  );
  const repository = new SqliteBookRepository(config.storage.sqlitePath);
  const csvExporter = new CsvExporter((mode) => `./csv/${mode}.csv`);
  const diffService = new BookListDiffService();

  const httpClient = new AxiosHttpClient();
  const openbdGateway = new OpenBDGateway(httpClient, logger);
  const isbnDbGateway = new ISBNdbGateway(httpClient, config.api.isbnDbApiKey, logger);
  const ndlGateway = new NDLGateway(httpClient, logger);
  const googleBooksGateway = new GoogleBooksGateway(httpClient, config.api.googleBooksApiKey, logger);
  const ciNiiGateway = new CiNiiGateway(httpClient, config.api.ciniiAppId, logger);
  const mathLibGateway = new MathLibCatalogGateway(httpClient, logger);
  const kinokuniyaGateway = new KinokuniyaScraper(browserFactory, logger);

  const aggregator = new DefaultBiblioInfoAggregator({
    bulkGateways: [openbdGateway],
    singleGateways: [isbnDbGateway, ndlGateway, googleBooksGateway, ciNiiGateway],
    collectionGateways: [mathLibGateway, kinokuniyaGateway],
    logger,
    concurrency: 5
  });

  const fallbackExporter = new FallbackCsvExporter((mode) => `./csv/${mode}-fallback.csv`);
  const firebaseUploader = new FirebaseUploader(config.api.firebase, config.storage, logger);

  const useCase = new SyncBookmeterUseCase({
    scrapingService,
    repository,
    csvExporter,
    fallbackExporter,
    diffService,
    aggregator,
    firebaseUploader,
    logger,
    clock
  });

  await useCase.execute({ mode: modeArg });
  return 0;
}
