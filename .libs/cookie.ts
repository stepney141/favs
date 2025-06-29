import fs from "node:fs";

import axios from "axios";
import { getDownloadURL, uploadBytes } from "firebase/storage";

import type { StorageReference } from "firebase/storage";
import type { CookieData } from "puppeteer";

export type CookieManager = {
  loadFromFirebase: () => Promise<CookieData[]>;
  saveToFirebase: (cookies: CookieData[]) => Promise<void>;
  saveToLocal: (cookies: CookieData[]) => void;
  cleanupLocal: () => void;
};

/**
 * Cookie management utilities for Firebase and local storage
 */
export function createCookieManager(
  pathReference: StorageReference,
  jobName: string,
  cookiePath: string
): CookieManager {
  return {
    /**
     * Load cookies from Firebase Storage
     */
    async loadFromFirebase(): Promise<CookieData[]> {
      try {
        const cookieUrl = await getDownloadURL(pathReference);
        const response = await axios.get(cookieUrl);
        fs.writeFileSync(cookiePath, JSON.stringify(response.data));
        console.log(`${jobName}: Loaded cookies from Firebase`);
        return response.data as CookieData[];
      } catch (error) {
        console.log(`${jobName}: No existing cookies found in Firebase`);
        return [];
      }
    },

    /**
     * Save cookies to Firebase Storage
     */
    async saveToFirebase(cookies: CookieData[]): Promise<void> {
      try {
        const cookiesBlob = new Blob([JSON.stringify(cookies)], { type: "application/json" });
        await uploadBytes(pathReference, cookiesBlob);
        console.log(`${jobName}: Cookies saved to Firebase`);
      } catch (error) {
        console.error(`${jobName}: Failed to save cookies to Firebase:`, error);
        throw error;
      }
    },

    /**
     * Save cookies to local file temporarily
     */
    saveToLocal(cookies: CookieData[]): void {
      fs.writeFileSync(cookiePath, JSON.stringify(cookies));
    },

    /**
     * Clean up local cookie file
     */
    cleanupLocal(): void {
      if (fs.existsSync(cookiePath)) {
        fs.unlinkSync(cookiePath);
        console.log(`${jobName}: Cleaned up local cookie file`);
      }
    }
  };
}
