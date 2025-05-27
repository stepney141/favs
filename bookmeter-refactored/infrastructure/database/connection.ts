import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Better SQLite3 + Drizzle ORM のデータベース接続を作成
 */
export function createDrizzleConnection(dbPath: string): BetterSQLite3Database<typeof schema> {
  try {
    // Better SQLite3 データベースインスタンスを作成
    const sqlite = new Database(dbPath);

    // Drizzle ORM でラップ
    return drizzle({ client: sqlite, schema });
  } catch (error: unknown) {
    throw new Error(
      `Failed to create database connection: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Drizzle データベース接続の型定義
 */
export type DrizzleDatabase = ReturnType<typeof createDrizzleConnection>;

/**
 * データベース接続を閉じる
 */
export function closeDrizzleConnection(db: Readonly<DrizzleDatabase>): void {
  // Better SQLite3 では同期的に close を呼び出す
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  (db as any).$client?.close?.();
}
