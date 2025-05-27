// 新しい関数型APIアダプターのエクスポート
export * from "./types";
export * from "./helpers";
export * from "./providers";
export * from "./biblioInfoService";

// 簡略化されたファクトリ関数
import { createBiblioInfoService } from "./biblioInfoService";

import type { APICredentials, BiblioInfoService } from "./types";
import type { Logger } from "@/application/ports/output/logger";

/**
 * 書誌情報マネージャを作成する（関数型版）
 */
export function createBiblioInfoManager(credentials: APICredentials, logger?: Logger): BiblioInfoService {
  return createBiblioInfoService(credentials, logger);
}

/**
 * レガシーサポート用の型互換ラッパー
 */
export interface BiblioInfoManagerLegacy {
  fetchBiblioInfo: BiblioInfoService["fetchBiblioInfo"];
}

/**
 * レガシーBiblioInfoManagerとの互換性を保つラッパー
 */
export function createLegacyBiblioInfoManager(credentials: APICredentials, logger?: Logger): BiblioInfoManagerLegacy {
  const service = createBiblioInfoService(credentials, logger);

  return {
    fetchBiblioInfo: service.fetchBiblioInfo
  };
}
