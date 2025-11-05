import path from "node:path";

import { config as loadEnv } from "dotenv";

import { CHROME_ARGS } from "../../../.libs/constants";

export interface BrowserConfig {
  headless: boolean;
  slowMoMs: number;
  viewport: { width: number; height: number };
  chromeArgs: string[];
}

export interface ApiCredentials {
  ciniiAppId: string;
  googleBooksApiKey: string;
  isbnDbApiKey: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
}

export interface StorageConfig {
  sqlitePath: string;
  firebaseDatabasePath: string;
}

export interface BookmeterConfig {
  defaultUserId: string;
  baseUri: string;
  account: string;
  password: string;
}

export interface RuntimeConfig {
  browser: BrowserConfig;
  api: ApiCredentials;
  storage: StorageConfig;
  bookmeter: BookmeterConfig;
}

const defaultEnvPath = path.join(__dirname, "../../../.env");

export const createRuntimeConfig = (envPath: string = defaultEnvPath): RuntimeConfig => {
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

  const browserConfig: BrowserConfig = {
    headless: true,
    slowMoMs: 15,
    viewport: { width: 1000, height: 1000 },
    chromeArgs: CHROME_ARGS
  };

  const apiCredentials: ApiCredentials = {
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

  const storageConfig: StorageConfig = {
    sqlitePath: "./books.sqlite",
    firebaseDatabasePath: "bookmeter/books.sqlite"
  };

  const bookmeterConfig: BookmeterConfig = {
    defaultUserId: "1003258",
    baseUri: "https://bookmeter.com",
    account: process.env.BOOKMETER_ACCOUNT!,
    password: process.env.BOOKMETER_PASSWORD!
  };

  return {
    browser: browserConfig,
    api: apiCredentials,
    storage: storageConfig,
    bookmeter: bookmeterConfig
  };
};
