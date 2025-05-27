import { loadConfig, validateConfig } from "./config";
import { createCoreDependencies } from "./dependencies";
import { createUseCaseFactory } from "./useCaseFactory";

import type { AppConfig } from "./config";
import type { CoreDependencies } from "./dependencies";
import type { UseCaseFactory } from "./useCaseFactory";


/**
 * アプリケーションのコンテキスト
 * DIコンテナに代わる、よりシンプルな依存関係管理
 */
export interface AppContext {
  readonly config: AppConfig;
  readonly dependencies: CoreDependencies;
  readonly useCases: UseCaseFactory;
}

/**
 * アプリケーションコンテキストを作成する
 * 複雑なDIコンテナに代わる、シンプルで理解しやすい依存関係の初期化
 * 
 * @returns アプリケーションコンテキスト
 */
export function createAppContext(): AppContext {
  // 1. 設定の読み込みとバリデーション
  const config = loadConfig();
  validateConfig(config);

  // 2. コア依存関係の作成（真にシングルトンが必要なもののみ）
  const dependencies = createCoreDependencies(config);

  // 3. ユースケースファクトリーの作成
  const useCases = createUseCaseFactory(dependencies, config);

  return {
    config,
    dependencies,
    useCases
  };
}

/**
 * 下位互換性のため、古いsetupDependencies関数を残す
 * @deprecated createAppContextを使用してください
 */
export function setupDependencies(): AppContext {
  return createAppContext();
}
