import { Container } from "inversify";
import "reflect-metadata";

// インターフェース
import { Logger } from "../../application/ports/output/logger";
import { BookRepository } from "../../application/ports/output/bookRepository";
import { BookScraperService } from "../../application/ports/output/bookScraperService";
import { BiblioInfoProvider } from "../../application/ports/output/biblioInfoProvider";
import { StorageService } from "../../application/ports/output/storageService";

// 実装
import { ConsoleLogger } from "../../infrastructure/adapters/logging/consoleLogger";
import { SqliteBookRepository } from "../../infrastructure/adapters/repositories/sqliteBookRepository";
import { BookmeterScraper } from "../../infrastructure/adapters/scraping/bookmeterScraper";
import { FileStorageService } from "../../infrastructure/adapters/storage/fileStorageService";

// ユースケース
import { createGetBookListUseCase } from "../../application/usecases/getBookListUseCase";
import { createFetchBiblioInfoUseCase } from "../../application/usecases/fetchBiblioInfoUseCase";
import { createSaveBookListUseCase } from "../../application/usecases/saveBookListUseCase";
import { createCrawlBookDescriptionUseCase } from "../../application/usecases/crawlBookDescriptionUseCase";

// 型定義
import { TYPES } from "./types";

/**
 * アプリケーションの依存性を設定する
 * 
 * @returns 設定済みの依存性注入コンテナ
 */
export function setupDependencies(): Container {
  const container = new Container();
  
  // インフラストラクチャ層の実装を登録
  container.bind<Logger>(TYPES.Logger).to(ConsoleLogger).inSingletonScope();
  container.bind<BookRepository>(TYPES.BookRepository).to(SqliteBookRepository).inSingletonScope();
  container.bind<BookScraperService>(TYPES.BookScraperService).to(BookmeterScraper).inTransientScope();
  container.bind<StorageService>(TYPES.StorageService).to(FileStorageService).inSingletonScope();
  
  // API連携のプロバイダー登録（ここでは簡略化のため省略）
  // 必要に応じて各API用のプロバイダーを個別に登録する
  
  // ファクトリ関数を使ってユースケースを登録
  // ユースケースは関数ベースで実装し、必要な依存を引数で受け取る
  container.bind(TYPES.GetBookListUseCase).toDynamicValue((context) => {
    return createGetBookListUseCase({
      logger: context.container.get<Logger>(TYPES.Logger),
      bookRepository: context.container.get<BookRepository>(TYPES.BookRepository),
      bookScraperService: context.container.get<BookScraperService>(TYPES.BookScraperService)
    });
  });
  
  container.bind(TYPES.FetchBiblioInfoUseCase).toDynamicValue((context) => {
    return createFetchBiblioInfoUseCase({
      logger: context.container.get<Logger>(TYPES.Logger),
      // 必要に応じて書誌情報APIプロバイダーを追加
    });
  });
  
  container.bind(TYPES.SaveBookListUseCase).toDynamicValue((context) => {
    return createSaveBookListUseCase({
      logger: context.container.get<Logger>(TYPES.Logger),
      bookRepository: context.container.get<BookRepository>(TYPES.BookRepository),
      storageService: context.container.get<StorageService>(TYPES.StorageService)
    });
  });
  
  container.bind(TYPES.CrawlBookDescriptionUseCase).toDynamicValue((context) => {
    return createCrawlBookDescriptionUseCase({
      logger: context.container.get<Logger>(TYPES.Logger),
      // 必要に応じて追加の依存関係を注入
    });
  });
  
  return container;
}
