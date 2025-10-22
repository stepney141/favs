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
  jobName: string;
  defaultUserId: string;
  baseUri: string;
}

export interface RuntimeConfig {
  browser: BrowserConfig;
  api: ApiCredentials;
  storage: StorageConfig;
  bookmeter: BookmeterConfig;
}
