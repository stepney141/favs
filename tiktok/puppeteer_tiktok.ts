import path from "path";

import { config } from "dotenv";
import { initializeApp } from "firebase/app";
import { getStorage, ref } from "firebase/storage";
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS, USER_AGENT } from "../.libs/constants";
import { getNodeProperty, waitForXPath, $x } from "../.libs/pptr-utils";
import { exportFile, sleep } from "../.libs/utils";

import { createCookieManager, ensureAuthentication } from "./../.libs/cookie";

import type { Browser, Page, CookieData } from "puppeteer";

const stealthPlugin = StealthPlugin();
/* ref:
- https://github.com/berstend/puppeteer-extra/issues/668
- https://github.com/berstend/puppeteer-extra/issues/822
*/
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("navigator.plugins");
stealthPlugin.enabledEvasions.delete("media.codecs");
puppeteer.use(stealthPlugin);

const JOB_NAME = "TikTok Favorite Movies";
const CSV_FILENAME = "tiktok_faved_movies.csv";
const baseURI = "https://www.tiktok.com";
const COOKIE_PATH = "tiktok_cookie.json";

const XPATH = {
  loginUsernameInput: '//*[@id="loginContainer"]/div[1]/form/div[1]/input',
  loginPasswordInput: '//*[@id="loginContainer"]/div[1]/form/div[2]/div/input',
  loginButtonEnabled: '//*[@id="loginContainer"]/div[1]/form/button',
  ToSavedMovies: '//span[contains(text(), "セーブ済み")]',
  savedMoviesHref: '//div[contains(@data-e2e,"favorites-item")]/div/div/a'
};

config({ path: path.join(__dirname, "../.env") });
const USERNAME = process.env.TIKTOK_USERNAME!.toString();
const PASSWORD = process.env.TIKTOK_PASSWORD!.toString();

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY!,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.FIREBASE_PROJECT_ID!,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.FIREBASE_APP_ID!
};

type Movie = {
  url: string;
  type: "video" | "photo";
};
type MovieList = Movie[];

const browserOptions = {
  executablePath: executablePath(),
  defaultViewport: { width: 1000, height: 1000 },
  acceptInsecureCerts: true,
  protocolTimeout: 300_000,
  ignoreDefaultArgs: ["--enable-automation"],
  args: [
    ...CHROME_ARGS,
    "--disable-blink-features=AutomationControlled" /* https://github.com/berstend/puppeteer-extra/issues/822 */
  ].filter((arg) => !arg.includes("single-process")),
  slowMo: 100,
  headless: false
};

/**
 * URLからコンテンツタイプ（video/photo）を判別する
 */
const determineContentType = (url: string): "video" | "photo" => {
  return url.includes("/video/") ? "video" : "photo";
};

/**
 * Test if cookies are valid by navigating to user profile page
 */
async function validateCookies(cookies: CookieData[]): Promise<boolean> {
  if (cookies.length === 0) {
    return false;
  }

  const browser = await puppeteer.launch(browserOptions);

  try {
    const page = await browser.newPage();
    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });
    await page.setUserAgent(USER_AGENT);

    // Set cookies
    await browser.setCookie(...cookies);

    // Try to navigate to user profile page
    await page.goto(`${baseURI}/@${USERNAME}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Check if we can find the "セーブ済み" element, indicating we're logged in
    try {
      await waitForXPath(page, XPATH.ToSavedMovies, { timeout: 10000 });
      console.log(`${JOB_NAME}: Existing cookies are valid`);
      return true;
    } catch (error) {
      console.log(`${JOB_NAME}: Existing cookies are invalid, need to login`);
      return false;
    }
  } catch (error) {
    console.log(`${JOB_NAME}: Cookie validation failed:`, error);
    return false;
  } finally {
    await browser.close();
  }
}

/**
 * Login using Puppeteer (fallback when cookies are invalid)
 */
async function performLogin(): Promise<CookieData[]> {
  console.log(`${JOB_NAME}: Starting login process...`);

  const browser = await puppeteer.launch(browserOptions);

  try {
    const page = await browser.newPage();
    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });
    await page.setUserAgent(USER_AGENT);

    await page.goto(`${baseURI}/login/phone-or-email/email`, {
      waitUntil: "domcontentloaded"
    });

    const usernameInputEH = await $x(page, XPATH.loginUsernameInput);
    const passwordInputEH = await $x(page, XPATH.loginPasswordInput);

    await usernameInputEH[0].type(USERNAME);
    await passwordInputEH[0].type(PASSWORD);

    await sleep(1000);
    const loginButtonEH = await $x(page, XPATH.loginButtonEnabled);
    console.log(`${JOB_NAME}: Logging in...`);

    await Promise.all([
      page.waitForResponse(
        (response) => {
          return (
            response.url().includes(`https://webcast.tiktok.com/webcast/wallet_api/fs/diamond_buy/permission_v2`) ===
              true && response.status() === 200
          );
        },
        { timeout: 60 * 1000 }
      ),
      loginButtonEH[0].click()
    ]);

    // Get cookies after successful login
    const cookies = await browser.cookies();
    console.log(`${JOB_NAME}: Login completed successfully`);

    return cookies;
  } finally {
    await browser.close();
  }
}

/**
 * lazy loading workaround
 * https://www.mrskiro.dev/posts/playwright-for-lazy-loading
 */
const scrollToBottom = async (page: Page): Promise<void> => {
  console.log(`${JOB_NAME}: Scrolling to bottom...`);
  await page.evaluate(async () => {
    // ugly hack to avoid esbuild bug...
    // ref: https://github.com/evanw/esbuild/issues/2605
    (window as any).__name = (func: Function) => func;

    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    // scroll to bottom
    for (let i = 0; i < document.body.scrollHeight; i += 100) {
      window.scrollTo(0, i);
      await delay(500);
    }
    await delay(3000);
    // scroll to top
    for (let i = document.body.scrollHeight; i > 0; i -= 100) {
      window.scrollTo(0, i);
      await delay(500);
    }
    await delay(3000);
  });
};

class TikToker {
  #browser: Browser;
  #cookies: CookieData[];
  #articleList: MovieList;

  constructor(browser: Browser, cookies: CookieData[]) {
    this.#browser = browser;
    this.#cookies = cookies;
    this.#articleList = [];
  }

  /**
   * Get current cookies from the browser (updated during scraping)
   */
  async getCurrentCookies(): Promise<CookieData[]> {
    return await this.#browser.cookies();
  }

  async explore(): Promise<MovieList> {
    const page = await this.#browser.newPage();

    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });
    await page.setUserAgent(USER_AGENT);

    // Set cookies before navigation
    for (const cookie of this.#cookies) {
      await this.#browser.setCookie(cookie);
    }

    console.log(`${JOB_NAME}: Exploring...`);

    await Promise.all([waitForXPath(page, XPATH.ToSavedMovies), page.goto(`${baseURI}/@${USERNAME}`)]);

    // お気に入り一覧へ遷移
    const toSavedMoviesEH = await $x(page, XPATH.ToSavedMovies);
    if (toSavedMoviesEH.length > 0) {
      await Promise.all([waitForXPath(page, XPATH.savedMoviesHref), toSavedMoviesEH[0].click()]);
    }
    await sleep(1000);

    // リンク取得
    await scrollToBottom(page);
    const savedMoviesHrefEH = $x(page, XPATH.savedMoviesHref);
    for (const href of await savedMoviesHrefEH) {
      const hrefText: string = await getNodeProperty(href, "href");
      console.log(hrefText);
      this.#articleList.push({
        url: hrefText,
        type: determineContentType(hrefText)
      });
    }

    return this.#articleList;
  }
}

(async () => {
  try {
    const startTime = Date.now();

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const storage = getStorage(app);
    const pathReference = ref(storage, COOKIE_PATH);
    const cookieManager = createCookieManager(pathReference, JOB_NAME, COOKIE_PATH);

    // Ensure authentication (load existing cookies or login)
    const cookies = await ensureAuthentication(cookieManager, validateCookies, performLogin);

    // Scrape TikTok
    const browser = await puppeteer.launch(browserOptions);
    const tiktok = new TikToker(browser, cookies);
    const urls = await tiktok.explore();

    // Get updated cookies from browser after scraping
    const updatedCookies = await tiktok.getCurrentCookies();
    console.log(`${JOB_NAME}: Retrieved updated cookies from browser`);

    // Save updated cookies to Firebase and cleanup local files
    await cookieManager.saveToFirebase(updatedCookies);
    cookieManager.cleanupLocal();

    await exportFile({
      fileName: CSV_FILENAME,
      payload: urls,
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: CSV Output Completed!`);
    });

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
