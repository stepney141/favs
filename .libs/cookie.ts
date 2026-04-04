import fs from "node:fs";

import axios from "axios";
import { getDownloadURL, uploadBytes } from "firebase/storage";
import * as setCookieParser from "set-cookie-parser";

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

/**
 * Ensure authentication by validating existing cookies or performing login
 */
export async function ensureAuthentication(
  cookieManager: CookieManager,
  validateCookies: (cookies: CookieData[]) => Promise<boolean>,
  performLogin: () => Promise<CookieData[]>
): Promise<CookieData[]> {
  // Try to load existing cookies from Firebase
  const existingCookies = await cookieManager.loadFromFirebase();

  // Validate existing cookies
  if (await validateCookies(existingCookies)) {
    return existingCookies;
  }

  // If cookies are invalid, perform login and save new cookies locally
  const newCookies = await performLogin();

  cookieManager.saveToLocal(newCookies);
  return newCookies;
}

/**
 * Convert Puppeteer cookies to axios cookie string format
 */
export function cookiesToString(cookies: CookieData[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * Merge existing cookies with new cookies from set-cookie header
 * New cookies will overwrite existing ones with the same name
 * Uses set-cookie-parser to properly parse all cookie attributes
 */
export function mergeCookies(domain: string, existingCookies: CookieData[], setCookieHeaders: string[]): CookieData[] {
  const cookieMap = new Map<string, CookieData>();

  // Add existing cookies to map
  for (const cookie of existingCookies) {
    cookieMap.set(cookie.name, cookie);
  }

  // Parse set-cookie headers using set-cookie-parser to get all attributes
  const parsedCookies = setCookieParser.parse(setCookieHeaders);

  for (const parsed of parsedCookies) {
    // Create new cookie preserving all server-provided attributes
    const newCookie: CookieData = {
      name: parsed.name,
      value: parsed.value,
      domain: parsed.domain || domain,
      path: parsed.path || "/",
      expires: parsed.expires
        ? parsed.expires.getTime() / 1000
        : parsed.maxAge
          ? Date.now() / 1000 + parsed.maxAge
          : -1,
      httpOnly: parsed.httpOnly || false,
      secure: parsed.secure || false,
      sameSite: (parsed.sameSite as "Strict" | "Lax" | "None") || "Lax"
    };

    cookieMap.set(parsed.name, newCookie);
  }

  return Array.from(cookieMap.values());
}
