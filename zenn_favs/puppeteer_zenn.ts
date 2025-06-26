import fs from "node:fs";
import path from "path";
import { createInterface } from "readline/promises";

import axios from "axios";
import { config } from "dotenv";
import { initializeApp } from "firebase/app";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile, sleep } from "../.libs/utils";

import { CHROME_ARGS, USER_AGENT } from "./../.libs/constants";

import type { StorageReference } from "firebase/storage";
import type { CookieData } from "puppeteer";

const stealthPlugin = StealthPlugin();
/* ref:
- https://github.com/berstend/puppeteer-extra/issues/668
- https://github.com/berstend/puppeteer-extra/issues/822
*/
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("navigator.plugins");
stealthPlugin.enabledEvasions.delete("media.codecs");
puppeteer.use(stealthPlugin);

const JOB_NAME = "Zenn.dev Favorite Articles";
const CSV_FILENAME = "zenn_faved_articles.csv";
const baseURI = "https://zenn.dev";
const COOKIE_PATH = "zenn_cookie.json";

const XPATH = {
  signInButton: '//button[contains(text(), "Googleアカウントをお持ちでない方")]',
  emailInput: '//*[@id="emailTextField"]',
  getPinCodeButton: '//button[contains(text(), "確認コードを送信")]',
  pinCodeInput: '//input[@type="tel"]',
  loginButton: '//button[contains(text(), "送信する")]',
  nextPaginationButton: '//button[contains(text(), "もっと読み込む")]'
};

config({ path: path.join(__dirname, "../.env") });
const zenn_email = process.env.ZENN_GOOGLE_ACCOUNT!.toString();

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY!,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.FIREBASE_PROJECT_ID!,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.FIREBASE_APP_ID!
};

type ZennFaved = {
  title: string;
  url: string;
  username: string;
  published_at: string;
  liked_count: number;
};

type ZennApiItem = {
  emoji: string;
  id: number;
  image_url: string;
  liked_count: number;
  path: string;
  post_type: "Article" | "Comment";
  published_at: string;
  slug: string;
  title: string;
  user: {
    username: string;
    name: string;
  };
};

type ZennApiEntry = {
  items: ZennApiItem[];
  next_page: number | null;
};

type CookieManager = {
  loadFromFirebase: () => Promise<CookieData[]>;
  saveToFirebase: (cookies: CookieData[]) => Promise<void>;
  saveToLocal: (cookies: CookieData[]) => void;
  cleanupLocal: () => void;
};

/**
 * Prompts the user to enter their PIN code from the terminal
 */
async function promptForPinCode(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const pinCode = await rl.question("Enter your PIN code: ");
    return pinCode.trim();
  } finally {
    rl.close();
  }
}

/**
 * Convert Puppeteer cookies to axios cookie string format
 */
function cookiesToString(cookies: CookieData[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * Cookie management utilities for Firebase and local storage
 */
function createCookieManager(pathReference: StorageReference): CookieManager {
  return {
    /**
     * Load cookies from Firebase Storage
     */
    async loadFromFirebase(): Promise<CookieData[]> {
      try {
        const cookieUrl = await getDownloadURL(pathReference);
        const response = await axios.get(cookieUrl);
        fs.writeFileSync(COOKIE_PATH, JSON.stringify(response.data));
        console.log(`${JOB_NAME}: Loaded cookies from Firebase`);
        return response.data as CookieData[];
      } catch (error) {
        console.log(`${JOB_NAME}: No existing cookies found in Firebase`);
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
        console.log(`${JOB_NAME}: Cookies saved to Firebase`);
      } catch (error) {
        console.error(`${JOB_NAME}: Failed to save cookies to Firebase:`, error);
        throw error;
      }
    },

    /**
     * Save cookies to local file temporarily
     */
    saveToLocal(cookies: CookieData[]): void {
      fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies));
    },

    /**
     * Clean up local cookie file
     */
    cleanupLocal(): void {
      if (fs.existsSync(COOKIE_PATH)) {
        fs.unlinkSync(COOKIE_PATH);
        console.log(`${JOB_NAME}: Cleaned up local cookie file`);
      }
    }
  };
}

/**
 * Test if cookies are valid by making a test API call
 */
async function validateCookies(cookies: CookieData[]): Promise<boolean> {
  if (cookies.length === 0) {
    return false;
  }

  try {
    await fetchZennLikes(cookies, 1);
    console.log(`${JOB_NAME}: Existing cookies are valid`);
    return true;
  } catch (error) {
    console.log(`${JOB_NAME}: Existing cookies are invalid, need to login`);
    return false;
  }
}

/**
 * Login using Puppeteer (fallback when cookies are invalid)
 */
async function performLogin(): Promise<CookieData[]> {
  console.log(`${JOB_NAME}: Starting login process...`);

  const browser = await puppeteer.launch({
    executablePath: executablePath(),
    defaultViewport: { width: 1000, height: 1000 },
    acceptInsecureCerts: true,
    protocolTimeout: 300_000,
    ignoreDefaultArgs: ["--enable-automation"],
    // ref:  https://github.com/berstend/puppeteer-extra/issues/822
    args: [...CHROME_ARGS, "--disable-blink-features=AutomationControlled"].filter(
      (arg) => !arg.includes("single-process")
    ),
    slowMo: 100,
    headless: true
  });

  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });
  await page.setUserAgent(USER_AGENT);

  await page.goto(`${baseURI}/enter`, {
    waitUntil: "load"
  });

  // login with an email address
  const signInButton_Handle = await $x(page, XPATH.signInButton);
  await signInButton_Handle[0].click();

  // input email
  console.log("Typing email ...");
  const emailInputHandle = await $x(page, XPATH.emailInput);
  await emailInputHandle[0].type(zenn_email);
  const getPinCodeButtonHandle = await $x(page, XPATH.getPinCodeButton);
  await getPinCodeButtonHandle[0].click();

  // Wait for PIN code input field to appear
  console.log("Waiting for PIN code input field...");
  let pinCodeInputHandle;
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    pinCodeInputHandle = await $x(page, XPATH.pinCodeInput);
    if (pinCodeInputHandle.length > 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  if (!pinCodeInputHandle || pinCodeInputHandle.length === 0) {
    throw new Error("PIN code input field not found after waiting");
  }

  // Prompt user for PIN code
  console.log("Please check your email/SMS for the PIN code.");
  const pinCode = await promptForPinCode();

  // input pin code
  console.log("Typing PIN code...");
  await pinCodeInputHandle[0].type(pinCode);
  const loginButtonHandle = await $x(page, XPATH.loginButton);

  await Promise.all([
    page.waitForResponse(
      (response) => {
        return response.url().includes(`${baseURI}/auth/init`) === true && response.status() === 200;
      },
      { timeout: 60_000 * 5 }
    ),
    loginButtonHandle[0].click()
  ]);

  // Get cookies after successful login
  const cookies = await browser.cookies();
  console.log(`${JOB_NAME}: Login completed successfully`);

  await browser.close();
  return cookies;
}

/**
 * Ensure authentication by validating existing cookies or performing login
 */
async function ensureAuthentication(cookieManager: CookieManager): Promise<CookieData[]> {
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
 * Convert API response items to ZennFaved format
 */
function convertApiItemsToArticles(items: ZennApiItem[]): Map<number, ZennFaved> {
  const articleList = new Map<number, ZennFaved>();

  for (const data of items) {
    const key = data.id; //記事IDみたいなもの？(整数値)
    const title = data.title; //記事名
    const url = baseURI + data.path; //記事URL(ブラウザでアクセスする時のURLそのものではなく、記事固有のURL)
    const username = data.user.name; //記事作成者名(アカウント名ではなくスクリーンネーム)
    const published_at = data.published_at; //公開時刻
    const liked_count = data.liked_count; //スキされた数

    // コメントへの「スキ」もいいね画面に表示されるが、これは不要なので弾く
    if (data.post_type !== "Comment") {
      articleList.set(key, {
        title,
        url,
        username,
        published_at,
        liked_count
      });
    }
  }

  return articleList;
}

/**
 * Fetch all liked articles using pagination
 */
async function fetchAllArticles(cookies: CookieData[]): Promise<Map<number, ZennFaved>> {
  console.log(`${JOB_NAME}: Starting to fetch liked articles...`);

  const allArticles = new Map<number, ZennFaved>();
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    try {
      console.log(`${JOB_NAME}: Fetching page ${page}...`);
      const apiResponse = await fetchZennLikes(cookies, page);

      // Convert and merge articles
      const pageArticles = convertApiItemsToArticles(apiResponse.items);
      for (const [key, article] of pageArticles) {
        allArticles.set(key, article);
      }

      // Check if there's a next page
      hasNextPage = apiResponse.next_page !== null;
      if (hasNextPage) {
        page = apiResponse.next_page!;
        await sleep(1000); // Rate limiting
      }
    } catch (error) {
      console.error(`${JOB_NAME}: Error fetching page ${page}:`, error);
      throw error;
    }
  }

  console.log(`${JOB_NAME}: Scraping completed! Found ${allArticles.size} articles`);
  return allArticles;
}

/**
 * Fetch Zenn likes data using cookies
 */
async function fetchZennLikes(cookies: CookieData[], page: number): Promise<ZennApiEntry> {
  const cookieString = cookiesToString(cookies);

  const response = await axios.get(`${baseURI}/api/me/library/likes?page=${page}`, {
    headers: {
      Cookie: cookieString,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "ja-JP"
    },
    timeout: 30000
  });

  return response.data as ZennApiEntry;
}

(async () => {
  try {
    const startTime = Date.now();

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const storage = getStorage(app);
    const pathReference = ref(storage, COOKIE_PATH);
    const cookieManager = createCookieManager(pathReference);

    // Ensure authentication (load existing cookies or login)
    const cookies = await ensureAuthentication(cookieManager);

    // Fetch all articles
    const articles = await fetchAllArticles(cookies);

    // Save cookies to Firebase and cleanup local files
    await cookieManager.saveToFirebase(cookies);
    cookieManager.cleanupLocal();

    await exportFile({
      fileName: CSV_FILENAME,
      payload: mapToArray(articles),
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: CSV Output Completed!`);
    });

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
