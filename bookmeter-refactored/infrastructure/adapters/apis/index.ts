// 各APIプロバイダのエクスポート
export * from "./openBDProvider";
export * from "./isbndbProvider";
export * from "./ndlProvider";
export * from "./googleBooksProvider";
export * from "./biblioInfoManager";

// ProvidersをまとめてFactory関数で作成
import { BiblioInfoManager } from "./biblioInfoManager";
import { GoogleBooksProvider } from "./googleBooksProvider";
import { ISBNdbProvider } from "./isbndbProvider";
import { NdlProvider } from "./ndlProvider";
import { OpenBDProvider } from "./openBDProvider";

import type { BiblioInfoProvider } from "@/application/ports/output/biblioInfoProvider";
import type { Logger } from "@/application/ports/output/logger";

/**
 * API認証情報
 */
export interface APICredentials {
  isbndb: string;
  google: string;
  cinii?: string;
}

/**
 * 書誌情報プロバイダを作成する
 */
export function createBiblioInfoProviders(credentials: APICredentials, logger?: Logger): BiblioInfoProvider[] {
  return [
    new OpenBDProvider(logger),
    new ISBNdbProvider(credentials.isbndb, logger),
    new NdlProvider(logger),
    new GoogleBooksProvider(credentials.google, logger)
  ];
}

/**
 * 書誌情報マネージャを作成する
 */
export function createBiblioInfoManager(credentials: APICredentials, logger?: Logger): BiblioInfoManager {
  const providers = createBiblioInfoProviders(credentials, logger);
  return new BiblioInfoManager(providers, logger);
}
