/**
 * Drizzle ORM の DB 接続管理。
 * better-sqlite3 を使用した同期 API を提供する。
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type DbClient = BetterSQLite3Database<typeof schema>;

export function createDbClient(dbPath: string): DbClient {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  return drizzle(sqlite, { schema });
}
