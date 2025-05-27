import path from "node:path";

import type { AppConfig } from "./config";
import type { BookContentScraperService } from "@/application/ports/output/bookContentScraperService";
import type { BookRepository } from "@/application/ports/output/bookRepository";
import type { Logger } from "@/application/ports/output/logger";
import type { StorageService } from "@/application/ports/output/storageService";
import type { BookListType } from "@/domain/models/book";

import { ConsoleLogger } from "@/infrastructure/adapters/logging/consoleLogger";
import { SqliteBookRepository } from "@/infrastructure/adapters/repositories/sqliteBookRepository";
import { KinokuniyaScraper } from "@/infrastructure/adapters/scraping/kinokuniyaScraper";
import { FileStorageService } from "@/infrastructure/adapters/storage/fileStorageService";

/**
 * アプリケーション全体で共有されるコア依存関係
 * 真にシングルトンが必要なもののみここに含める
 */
export interface CoreDependencies {
  readonly logger: Logger;
  readonly bookRepository: BookRepository;
  readonly storageService: StorageService;
  readonly bookContentScraperService: BookContentScraperService;
}

/**
 * コア依存関係を作成する
 * @param config アプリケーション設定
 * @returns コア依存関係
 */
export function createCoreDependencies(config: AppConfig): CoreDependencies {
  // Logger: アプリ全体で一貫したロギングが必要
  const logger = new ConsoleLogger("App", config.logLevel);

  // BookRepository: データベース接続の管理が必要
  const bookRepository = new SqliteBookRepository(
    path.join(config.dataDir, "books.sqlite"),
    logger
  );

  // StorageService: ファイルシステムリソースの管理が必要
  const defaultCsvPath: Record<BookListType, string> = {
    wish: path.join(config.dataDir, "bookmeter_wish_books.csv"),
    stacked: path.join(config.dataDir, "bookmeter_stacked_books.csv")
  };
  
  const storageService = new FileStorageService(
    logger,
    bookRepository,
    { defaultCsvPath }
  );

  // BookContentScraperService: puppeteerリソースの管理を考慮してシングルトン
  const bookContentScraperService = new KinokuniyaScraper(logger);

  return {
    logger,
    bookRepository,
    storageService,
    bookContentScraperService
  };
}
