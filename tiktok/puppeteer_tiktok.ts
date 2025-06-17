import path from "path";

import { config } from "dotenv";
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../.libs/constants";
import { getNodeProperty, waitForXPath, $x } from "../.libs/pptr-utils";
import { exportFile, sleep } from "../.libs/utils";

import type { Browser, Page } from "puppeteer";

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

type Movie = {
  url: string;
  type: "video" | "photo";
};
type MovieList = Movie[];

/**
 * URLからコンテンツタイプ（video/photo）を判別する
 */
const determineContentType = (url: string): "video" | "photo" => {
  return url.includes("/video/") ? "video" : "photo";
};

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
  #articleList: MovieList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#articleList = [];
  }

  async login(): Promise<TikToker> {
    const page = await this.#browser.newPage();

    /* https://github.com/berstend/puppeteer-extra/issues/668 */
    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });

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
      page.waitForResponse((response) => {
        return (
          response.url().includes(`https://webcast.tiktok.com/webcast/wallet_api/fs/diamond_buy/permission_v2`) ===
            true && response.status() === 200
        );
      }),
      loginButtonEH[0].click()
    ]);

    return this;
  }

  async explore(): Promise<MovieList> {
    const page = await this.#browser.newPage();

    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });

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

    const browser = await puppeteer.launch({
      executablePath: executablePath(),
      defaultViewport: { width: 1000, height: 1000 },
      args: [
        ...CHROME_ARGS,
        // '--disable-gpu',
        "--disable-blink-features=AutomationControlled" /* https://github.com/berstend/puppeteer-extra/issues/822 */,
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-zygote"
        // '--single-process'
      ],
      slowMo: 100,
      headless: false //セキュリティコード使わずに2段階認証する時はheadfullの方が楽
    });

    const tiktok = new TikToker(browser);
    const urls = await tiktok.login().then((t) => t.explore());

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
