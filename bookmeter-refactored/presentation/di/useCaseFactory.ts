import type { AppConfig } from "./config";
import type { CoreDependencies } from "./dependencies";
import type {
  CrawlBookDescriptionUseCase,
  FetchBiblioInfoUseCase,
  GetBookListUseCase,
  SaveBookListUseCase
} from "./types";
import type { BookScraperService } from "@/application/ports/output/bookScraperService";
import type { BiblioInfoService } from "@/infrastructure/adapters/apis/types";

import { createCrawlBookDescriptionUseCase } from "@/application/usecases/crawlBookDescriptionUseCase";
import { createFetchBiblioInfoUseCase } from "@/application/usecases/fetchBiblioInfoUseCase";
import { createGetBookListUseCase } from "@/application/usecases/getBookListUseCase";
import { createSaveBookListUseCase } from "@/application/usecases/saveBookListUseCase";
import { createBiblioInfoManager } from "@/infrastructure/adapters/apis";

/**
 * ユースケースファクトリー
 * 関数ベースのユースケースを作成するためのファクトリー関数群
 */
export interface UseCaseFactory {
  createGetBookListUseCase: (bookScraperService: BookScraperService) => GetBookListUseCase;
  createFetchBiblioInfoUseCase: () => FetchBiblioInfoUseCase;
  createSaveBookListUseCase: () => SaveBookListUseCase;
  createCrawlBookDescriptionUseCase: () => CrawlBookDescriptionUseCase;
}

/**
 * ユースケースファクトリーを作成する
 * @param deps コア依存関係
 * @param config アプリケーション設定
 * @returns ユースケースファクトリー
 */
export function createUseCaseFactory(
  deps: CoreDependencies,
  config: AppConfig
): UseCaseFactory {
  // BiblioInfoServiceは複数のAPIプロバイダーを管理するため、
  // ファクトリー内で一度だけ作成してキャッシュする
  let biblioInfoService: BiblioInfoService | null = null;

  const getBiblioInfoService = (): BiblioInfoService => {
    if (!biblioInfoService) {
      biblioInfoService = createBiblioInfoManager(config.apiCredentials, deps.logger);
    }
    return biblioInfoService;
  };

  return {
    createGetBookListUseCase: (bookScraperService: BookScraperService) =>
      createGetBookListUseCase(deps.bookRepository, bookScraperService, deps.logger),

    createFetchBiblioInfoUseCase: () =>
      createFetchBiblioInfoUseCase(getBiblioInfoService(), deps.logger),

    createSaveBookListUseCase: () =>
      createSaveBookListUseCase(deps.bookRepository, deps.storageService, deps.logger),

    createCrawlBookDescriptionUseCase: () =>
      createCrawlBookDescriptionUseCase(
        deps.bookRepository,
        deps.bookContentScraperService,
        deps.logger
      )
  };
}
