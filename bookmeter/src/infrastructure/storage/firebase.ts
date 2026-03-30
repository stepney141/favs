import fs from "node:fs";

import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";

import { JOB_NAME } from "../domain/constants";

import type { BackupPublisher } from "../application/ports";

const DEFAULT_DB_FILE = "./books.sqlite";
const DEFAULT_DB_STORAGE_PATH = "bookmeter/books.sqlite";

export type FirebaseStorageConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

type FirebasePublisherDependencies = {
  dbFilePath?: string;
  storagePath?: string;
};

/**
 * SQLiteデータベースファイルをFirebase Storageにアップロードする
 */
async function uploadDatabaseToFirebase(
  config: FirebaseStorageConfig,
  { dbFilePath = DEFAULT_DB_FILE, storagePath = DEFAULT_DB_STORAGE_PATH }: FirebasePublisherDependencies = {}
): Promise<void> {
  // ファイルの存在チェック
  if (!fs.existsSync(dbFilePath)) {
    throw new Error(`Database file ${dbFilePath} does not exist.`);
  }

  try {
    console.log(`${JOB_NAME}: Uploading SQLite database to Firebase Storage...`);

    // Firebase初期化
    const app = initializeApp(config);
    const storage = getStorage(app);
    const dbRef = ref(storage, storagePath);

    // ファイル読み込みとアップロード
    const fileBuffer = fs.readFileSync(dbFilePath);
    await uploadBytes(dbRef, fileBuffer);

    console.log(`${JOB_NAME}: Database uploaded successfully to ${storagePath}`);
  } catch (error) {
    console.error(`${JOB_NAME}: Error uploading database to Firebase:`, error);
    throw error;
  }
}

export function createFirebaseStoragePublisher(
  config: FirebaseStorageConfig,
  options: FirebasePublisherDependencies = {}
): BackupPublisher {
  return {
    publish: async () => {
      await uploadDatabaseToFirebase(config, options);
    }
  };
}
