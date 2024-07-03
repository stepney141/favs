import path from "path";

import { config } from "dotenv";
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { getNodeProperty, waitForXPath, $x } from "../.libs/pptr-utils";
import { exportFile, sleep } from "../.libs/utils";

import type { Browser } from "puppeteer";

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
  infoBox: '//button[contains(text(), "閉じる")]',
  ToSavedMovies: '//*[@id="main-content-others_homepage"]/div/div[2]/div/p[2]/span',
  savedMoviesHref: '//*[@id="main-content-others_homepage"]/div/div[2]/div[2]/div/div[*]/div[1]/div/div/a'
};

config({ path: path.join(__dirname, "../.env") });
const USERNAME = process.env.TIKTOK_USERNAME!.toString();
const PASSWORD = process.env.TIKTOK_PASSWORD!.toString();

type Movie = {
  url: string;
};
type MovieList = Movie[];

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

    await Promise.all([
      page.waitForResponse((response) => {
        return (
          response.url().includes(`https://webcast.tiktok.com/webcast/wallet_api/diamond_buy/permission_v2/`) ===
            true && response.status() === 200
        );
      }),
      loginButtonEH[0].click()
    ]);

    return this;
  }

  async explore() {
    const page = await this.#browser.newPage();

    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });

    await Promise.all([waitForXPath(page, XPATH.infoBox), page.goto(`${baseURI}/@${USERNAME}`)]);

    const infoBoxEH = await $x(page, XPATH.infoBox);
    if (infoBoxEH.length > 0) {
      await infoBoxEH[0].click();
    }

    await sleep(1000);

    const toSavedMoviesEH = await $x(page, XPATH.ToSavedMovies);
    await Promise.all([waitForXPath(page, XPATH.savedMoviesHref), toSavedMoviesEH[0].click()]);

    await sleep(1000);

    const savedMoviesHrefEH = await $x(page, XPATH.savedMoviesHref);

    for (const href of savedMoviesHrefEH) {
      const hrefText: string = await getNodeProperty(href, "href");
      console.log(hrefText);
      this.#articleList.push({
        url: hrefText
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
        // '--disable-gpu',
        "--disable-blink-features=AutomationControlled" /* https://github.com/berstend/puppeteer-extra/issues/822 */,
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-sandbox",
        "--no-zygote"
        // '--single-process'
      ],
      slowMo: 50,
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
  }
})();
