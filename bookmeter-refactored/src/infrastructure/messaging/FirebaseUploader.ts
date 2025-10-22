import { readFile } from "node:fs/promises";

import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";

import type { ApiCredentials, StorageConfig } from "@/shared/config/Config";
import type { Logger } from "@/shared/logging/Logger";

export class FirebaseUploader {
  constructor(private readonly credentials: ApiCredentials["firebase"], private readonly storage: StorageConfig, private readonly logger: Logger) {}

  async uploadSqliteSnapshot(): Promise<void> {
    const app = initializeApp({
      apiKey: this.credentials.apiKey,
      authDomain: this.credentials.authDomain,
      projectId: this.credentials.projectId,
      storageBucket: this.credentials.storageBucket,
      messagingSenderId: this.credentials.messagingSenderId,
      appId: this.credentials.appId
    });

    const storage = getStorage(app);
    const buffer = await readFile(this.storage.sqlitePath);
    const refHandle = ref(storage, this.storage.firebaseDatabasePath);
    await uploadBytes(refHandle, buffer);
    this.logger.info(`Uploaded SQLite snapshot to ${this.storage.firebaseDatabasePath}`);
  }
}
