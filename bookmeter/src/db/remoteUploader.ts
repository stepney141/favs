/**
 * リモートストレージへのアップロードを抽象化するインターフェースと Firebase 実装。
 * 将来 S3 / R2 等への差し替えを想定。
 */

import fs from "node:fs";

import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";

import { JOB_NAME } from "../constants";

export interface RemoteUploader {
  upload(localFilePath: string): Promise<void>;
}

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export function createFirebaseUploader(config: FirebaseConfig, storagePath: string): RemoteUploader {
  return {
    async upload(localFilePath: string): Promise<void> {
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`Database file ${localFilePath} does not exist.`);
      }

      try {
        console.log(`${JOB_NAME}: Uploading SQLite database to Firebase Storage...`);

        const app = initializeApp(config);
        const storage = getStorage(app);
        const dbRef = ref(storage, storagePath);

        const fileBuffer = fs.readFileSync(localFilePath);
        await uploadBytes(dbRef, fileBuffer);

        console.log(`${JOB_NAME}: Database uploaded successfully to ${storagePath}`);
      } catch (error) {
        console.error(`${JOB_NAME}: Error uploading database to Firebase:`, error);
        throw error;
      }
    }
  };
}
