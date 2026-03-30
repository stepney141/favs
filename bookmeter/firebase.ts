import fs from "node:fs";

import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";

import { JOB_NAME } from "./constants";

const DB_FILE = "./books.sqlite";
const DB_STORAGE_PATH = "bookmeter/books.sqlite";

// Firebaseの設定（.envから取得）
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY!,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.FIREBASE_PROJECT_ID!,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.FIREBASE_APP_ID!
};

/**
 * SQLiteデータベースファイルをFirebase Storageにアップロードする
 */
export async function uploadDatabaseToFirebase(): Promise<void> {
  // ファイルの存在チェック
  if (!fs.existsSync(DB_FILE)) {
    throw new Error(`Database file ${DB_FILE} does not exist.`);
  }

  try {
    console.log(`${JOB_NAME}: Uploading SQLite database to Firebase Storage...`);

    // Firebase初期化
    const app = initializeApp(firebaseConfig);
    const storage = getStorage(app);
    const dbRef = ref(storage, DB_STORAGE_PATH);

    // ファイル読み込みとアップロード
    const fileBuffer = fs.readFileSync(DB_FILE);
    await uploadBytes(dbRef, fileBuffer);

    console.log(`${JOB_NAME}: Database uploaded successfully to ${DB_STORAGE_PATH}`);
  } catch (error) {
    console.error(`${JOB_NAME}: Error uploading database to Firebase:`, error);
    throw error;
  }
}
