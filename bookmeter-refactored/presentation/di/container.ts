// インターフェース
import path from "node:path"; // path モジュールをインポート

import { TYPES } from "./types";

import type { APICredentials, DependencyKey } from "./types";
import type { BookRepository } from "@/application/ports/output/bookRepository";
import type { BookScraperService } from "@/application/ports/output/bookScraperService";
import type { Logger } from "@/application/ports/output/logger";
import type { StorageService } from "@/application/ports/output/storageService";
import type { BookListType } from "@/domain/models/book"; // BookListType をインポート
import type { BiblioInfoManager } from "@/infrastructure/adapters/apis/biblioInfoManager";

import { createCrawlBookDescriptionUseCase } from "@/application/usecases/crawlBookDescriptionUseCase";
import { createFetchBiblioInfoUseCase } from "@/application/usecases/fetchBiblioInfoUseCase";
import { createGetBookListUseCase } from "@/application/usecases/getBookListUseCase";
import { createSaveBookListUseCase } from "@/application/usecases/saveBookListUseCase";
import { createBiblioInfoManager } from "@/infrastructure/adapters/apis";
import { ConsoleLogger } from "@/infrastructure/adapters/logging/consoleLogger";
import { SqliteBookRepository } from "@/infrastructure/adapters/repositories/sqliteBookRepository";
import { BookmeterScraper } from "@/infrastructure/adapters/scraping/bookmeterScraper";
import { FileStorageService } from "@/infrastructure/adapters/storage/fileStorageService";

/**
 * DIコンテナのインターフェース
 */
export interface DIContainer {
  register<T>(key: DependencyKey, factory: () => T): void;
  registerSingleton<T>(key: DependencyKey, factory: () => T): void;
  get<T>(key: DependencyKey): T;
}

/**
 * シンプルなDIコンテナの実装
 */
export class Container implements DIContainer {
  private instances = new Map<DependencyKey, unknown>();
  private factories = new Map<DependencyKey, () => unknown>();
  private singletons = new Set<DependencyKey>();

  /**
   * 依存関係をコンテナに登録する（トランジェントスコープ）
   *
   * @param key 依存関係の識別子
   * @param factory インスタンスを生成するファクトリ関数
   */
  register<T>(key: DependencyKey, factory: () => T): void {
    this.factories.set(key, factory as () => unknown);
  }

  /**
   * 依存関係をコンテナに登録する（シングルトンスコープ）
   *
   * @param key 依存関係の識別子
   * @param factory インスタンスを生成するファクトリ関数
   */
  registerSingleton<T>(key: DependencyKey, factory: () => T): void {
    this.factories.set(key, factory as () => unknown);
    this.singletons.add(key);
  }

  /**
   * 依存関係を取得する
   *
   * @param key 依存関係の識別子
   * @returns 依存関係のインスタンス
   */
  get<T>(key: DependencyKey): T {
    // シングルトンの場合、インスタンスがあればそれを返す
    if (this.singletons.has(key) && this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    // ファクトリを取得
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`依存関係が登録されていません: ${key}`);
    }

    // インスタンス生成
    const instance = factory();

    // シングルトンならキャッシュする
    if (this.singletons.has(key)) {
      this.instances.set(key, instance);
    }

    return instance as T;
  }
}

/**
 * アプリケーションの依存性を設定する
 *
 * @returns 設定済みの依存性注入コンテナ
 */
export function setupDependencies(): DIContainer {
  const container = new Container();

  // データディレクトリパスを定義・登録
  const dataDir = path.resolve(__dirname, "../../../data"); // presentation/di -> presentation -> bookmeter-refactored -> data
  container.registerSingleton<string>(TYPES.DataDirectory, () => dataDir);

  // インフラストラクチャ層の実装を登録
  container.registerSingleton<Logger>(TYPES.Logger, () => new ConsoleLogger("App")); // prefix を追加
  container.registerSingleton<BookRepository>(TYPES.BookRepository, () => {
    const logger = container.get<Logger>(TYPES.Logger);
    const dataDir = container.get<string>(TYPES.DataDirectory);
    const dbPath = path.join(dataDir, "books.sqlite"); // データディレクトリ内のパスを使用
    return new SqliteBookRepository(dbPath, logger);
  });
  container.register<BookScraperService>(TYPES.BookScraperService, () => {
    const logger = container.get<Logger>(TYPES.Logger);
    const credentials = {
      // credentials を追加
      username: process.env.BOOKMETER_ACCOUNT || "",
      password: process.env.BOOKMETER_PASSWORD || ""
    };
    if (!credentials.username || !credentials.password) {
      throw new Error("Bookmeterの認証情報が環境変数に設定されていません (BOOKMETER_ACCOUNT, BOOKMETER_PASSWORD)");
    }
    return new BookmeterScraper(logger, credentials); // 引数を渡す
  });
  container.registerSingleton<StorageService>(TYPES.StorageService, () => {
    const logger = container.get<Logger>(TYPES.Logger);
    const bookRepository = container.get<BookRepository>(TYPES.BookRepository);
    const dataDir = container.get<string>(TYPES.DataDirectory); // データディレクトリパスを取得
    // CSVパスをデータディレクトリ内に変更
    const defaultCsvPath: Record<BookListType, string> = {
      wish: path.join(dataDir, "bookmeter_wish_books.csv"), // データディレクトリ内のパスを使用
      stacked: path.join(dataDir, "bookmeter_stacked_books.csv") // データディレクトリ内のパスを使用
    };
    // TODO: firebaseConfigが必要な場合はここに追加
    return new FileStorageService(logger, bookRepository, { defaultCsvPath });
  });

  // API認証情報を登録
  container.registerSingleton<APICredentials>(TYPES.APICredentials, () => {
    return {
      isbndb: process.env.ISBNDB_API_KEY || "",
      google: process.env.GOOGLE_BOOKS_API_KEY || "",
      cinii: process.env.CINII_API_APPID || ""
    };
  });

  // BiblioInfoManagerを登録
  container.registerSingleton(TYPES.BiblioInfoManager, () => {
    const logger = container.get<Logger>(TYPES.Logger);
    const credentials = container.get<APICredentials>(TYPES.APICredentials);

    // 認証情報のバリデーション
    if (!credentials.isbndb || !credentials.google) {
      throw new Error("API認証情報が環境変数に設定されていません (ISBNDB_API_KEY, GOOGLE_BOOKS_API_KEY)");
    }

    return createBiblioInfoManager(credentials, logger);
  });

  // ファクトリ関数を使ってユースケースを登録
  // ユースケースは関数ベースで実装し、必要な依存を引数で受け取る
  container.register(TYPES.GetBookListUseCase, () => {
    return createGetBookListUseCase(
      container.get<BookRepository>(TYPES.BookRepository),
      container.get<BookScraperService>(TYPES.BookScraperService),
      container.get<Logger>(TYPES.Logger)
    );
  });

  container.register(TYPES.FetchBiblioInfoUseCase, () => {
    // BiblioInfoManagerに明示的な型指定を追加
    const biblioInfoManager = container.get<BiblioInfoManager>(TYPES.BiblioInfoManager);
    const logger = container.get<Logger>(TYPES.Logger);
    return createFetchBiblioInfoUseCase(biblioInfoManager, logger);
  });

  container.register(TYPES.SaveBookListUseCase, () => {
    return createSaveBookListUseCase(
      container.get<BookRepository>(TYPES.BookRepository),
      container.get<StorageService>(TYPES.StorageService),
      container.get<Logger>(TYPES.Logger)
    );
  });

  container.register(TYPES.CrawlBookDescriptionUseCase, () => {
    return createCrawlBookDescriptionUseCase(
      container.get<BookRepository>(TYPES.BookRepository),
      container.get<BookScraperService>(TYPES.BookScraperService),
      container.get<Logger>(TYPES.Logger)
    );
  });

  return container;
}
