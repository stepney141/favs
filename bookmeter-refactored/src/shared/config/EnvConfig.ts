import path from "node:path";

import { config as loadEnv } from "dotenv";

import type { RuntimeConfig } from "@/shared/config/Config";

export class EnvConfig implements RuntimeConfig {
  public readonly browser;
  public readonly api;
  public readonly storage;
  public readonly bookmeter;

  constructor(envPath: string = path.join(__dirname, "../../../../.env")) {
    loadEnv({ path: envPath });

    const required = [
      "CINII_API_APPID",
      "GOOGLE_BOOKS_API_KEY",
      "ISBNDB_API_KEY",
      "FIREBASE_API_KEY",
      "FIREBASE_AUTH_DOMAIN",
      "FIREBASE_PROJECT_ID",
      "FIREBASE_STORAGE_BUCKET",
      "FIREBASE_MESSAGING_SENDER_ID",
      "FIREBASE_APP_ID",
      "BOOKMETER_ACCOUNT",
      "BOOKMETER_PASSWORD"
    ];

    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }

    this.browser = {
      headless: true,
      slowMoMs: 15,
      viewport: { width: 1000, height: 1000 },
      chromeArgs: []
    };

    this.api = {
      ciniiAppId: process.env.CINII_API_APPID!,
      googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY!,
      isbnDbApiKey: process.env.ISBNDB_API_KEY!,
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY!,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
        projectId: process.env.FIREBASE_PROJECT_ID!,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
        appId: process.env.FIREBASE_APP_ID!
      }
    };

    this.storage = {
      sqlitePath: "./books.sqlite",
      firebaseDatabasePath: "bookmeter/books.sqlite"
    };

    this.bookmeter = {
      jobName: "Bookmeter Wished Books",
      defaultUserId: "1003258",
      baseUri: "https://bookmeter.com",
      account: process.env.BOOKMETER_ACCOUNT!,
      password: process.env.BOOKMETER_PASSWORD!
    };
  }
}
