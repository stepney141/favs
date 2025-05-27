import path from "node:path";

/**
 * アプリケーション全体の設定
 */
export interface AppConfig {
  readonly dataDir: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly database: {
    readonly useDrizzle: boolean;
  };
  readonly bookmeterCredentials: {
    readonly username: string;
    readonly password: string;
  };
  readonly apiCredentials: {
    readonly isbndb: string;
    readonly google: string;
    readonly cinii?: string;
  };
}

/**
 * 環境変数から設定を読み込む
 * @returns アプリケーション設定
 */
export function loadConfig(): AppConfig {
  return {
    dataDir: path.resolve(__dirname, "../../data"),
    logLevel: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info",
    database: {
      useDrizzle: process.env.USE_DRIZZLE === "true"
    },
    bookmeterCredentials: {
      username: process.env.BOOKMETER_ACCOUNT || "",
      password: process.env.BOOKMETER_PASSWORD || ""
    },
    apiCredentials: {
      isbndb: process.env.ISBNDB_API_KEY || "",
      google: process.env.GOOGLE_BOOKS_API_KEY || "",
      cinii: process.env.CINII_API_APPID || ""
    }
  };
}

/**
 * 設定のバリデーション
 * @param config アプリケーション設定
 * @throws 必須の設定が不足している場合
 */
export function validateConfig(config: AppConfig): void {
  if (!config.bookmeterCredentials.username || !config.bookmeterCredentials.password) {
    throw new Error("Bookmeterの認証情報が環境変数に設定されていません (BOOKMETER_ACCOUNT, BOOKMETER_PASSWORD)");
  }

  if (!config.apiCredentials.isbndb || !config.apiCredentials.google) {
    throw new Error("API認証情報が環境変数に設定されていません (ISBNDB_API_KEY, GOOGLE_BOOKS_API_KEY)");
  }
}
