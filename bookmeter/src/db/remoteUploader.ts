/**
 * リモートストレージへのアップロードを抽象化するインターフェースと Firebase 実装。
 * 将来 S3 / R2 等への差し替えを想定。
 */

import fs from "node:fs";

import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";

import { Err, Ok } from "../../../.libs/lib";
import { JOB_NAME } from "../constants";

import { DbError } from "./errors";

import type { Result } from "../../../.libs/lib";

export interface RemoteUploader {
  upload(localFilePath: string): Promise<Result<void, DbError>>;
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
    async upload(localFilePath: string) {
      if (!fs.existsSync(localFilePath)) {
        return Err(
          new DbError(
            { type: "uploadFailed", filePath: localFilePath },
            { cause: new Error(`Database file ${localFilePath} does not exist.`) }
          )
        );
      }

      try {
        console.log(`${JOB_NAME}: Uploading SQLite database to Firebase Storage...`);

        const app = initializeApp(config);
        const storage = getStorage(app);
        const dbRef = ref(storage, storagePath);

        const fileBuffer = fs.readFileSync(localFilePath);
        await uploadBytes(dbRef, fileBuffer);

        console.log(`${JOB_NAME}: Database uploaded successfully to ${storagePath}`);
        return Ok(undefined);
      } catch (e) {
        console.error(`${JOB_NAME}: Error uploading database to Firebase:`, e);
        return Err(new DbError({ type: "uploadFailed", filePath: localFilePath }, { cause: e }));
      }
    }
  };
}
