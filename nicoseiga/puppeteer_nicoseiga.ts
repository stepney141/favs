import fs from "fs";
import path from "path";

import { config } from "dotenv";
import papa from "papaparse";
import puppeteer from "puppeteer";

import { zip } from "../.libs/utils";

import type { Browser, ElementHandle, Page, Protocol } from "puppeteer";

const JOB_NAME = "Niconico Seiga MyClips";
const CSV_FILENAME = "nicoseiga_myclips";
const LOGIN_URL = "https://account.nicovideo.jp/login?site=seiga&next_url=%2Fmy%2Fclip";
const MYCLIP_URL = "https://seiga.nicovideo.jp/my/clip";
const COOKIE_PATH = "./seiga_cookie.json";

const XPATH = {
  useridInput: '//*[@id="input__mailtel"]',
  passwordInput: '//*[@id="input__password"]',
  loginButton: '//*[@id="login__submit"]',
  eachIllust: '//*[@id="clip_image_list"]/div',
  eachIllustLinks: '//*[@id="clip_image_list"]//div[2]/a',
  eachIllustCreatedDates: '//*[@class="created_date bold"]',
  eachIllustClippedDates: '//*[@class="clip_date bold"]',
  toNextPageButtons: '//li/*[contains(text(), "次へ")]'
};

config({ path: path.join(__dirname, "../.env") });
const user_name = process.env.NICONICO_ACCOUNT!.toString();
const password = process.env.NICONICO_PASSWORD!.toString();

async function isNotLoggedInSeiga(page: Page) {
  const eh = await page.$x(XPATH.eachIllustLinks);
  return eh.length == 0;
}

type Clip = { url: string; title: string; created_date: string; clipped_date: string };

class Seiga {
  fetchedData: Map<string, Clip>;

  constructor() {
    this.fetchedData = new Map();
  }

  async login(browser: Browser) {
    try {
      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        "accept-language": "ja-JP"
      });
      await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36"
      );
      await page.evaluateOnNewDocument(() => {
        //webdriver.navigatorを消して自動操縦であることを隠す
        Object.defineProperty(navigator, "webdriver", () => {});
        delete navigator.__proto__.webdriver;
      });

      if (fs.existsSync(COOKIE_PATH)) {
        const savedCookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf-8")) as Protocol.Network.CookieParam[];
        for (const cookie of savedCookies) {
          await page.setCookie(cookie);
        }
      }

      await page.goto(MYCLIP_URL, {
        waitUntil: "load"
      });

      if (await isNotLoggedInSeiga(page)) {
        await page.goto(LOGIN_URL, {
          waitUntil: "load"
        });

        const useridInput_Handle = page.$x(XPATH.useridInput);
        const passwordInput_Handle = page.$x(XPATH.passwordInput);
        const loginButton_Handle = page.$x(XPATH.loginButton);

        await (await useridInput_Handle)[0].type(user_name);
        await (await passwordInput_Handle)[0].type(password);

        await Promise.all([
          page.waitForNavigation({
            timeout: 60000,
            waitUntil: "networkidle2"
          }),
          await (loginButton_Handle[0] as ElementHandle<Element>).click()
        ]);
      }

      const afterCookies = await page.cookies();
      fs.writeFileSync(COOKIE_PATH, JSON.stringify(afterCookies));

      console.log(`${JOB_NAME}: Login Completed!`);
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    return true;
  }

  async scraper(browser: Browser) {
    try {
      const page = (await browser.pages())[1];

      console.log(`${JOB_NAME}: Scraping Started!`);

      for (;;) {
        const eachIllustLinks_eh = await page.$x(XPATH.eachIllustLinks);
        const createdDate_eh = await page.$x(XPATH.eachIllustCreatedDates);
        const clippedDate_eh = await page.$x(XPATH.eachIllustClippedDates);

        for (const [illustLink_dom, created_date_dom, clipped_date_dom] of zip(
          eachIllustLinks_eh,
          createdDate_eh,
          clippedDate_eh
        )) {
          const url = await (await illustLink_dom.getProperty("href")).jsonValue();
          const title = await (await illustLink_dom.getProperty("innerText")).jsonValue();
          const created_date = await (await created_date_dom.getProperty("innerText")).jsonValue();
          const clipped_date = await (await clipped_date_dom.getProperty("innerText")).jsonValue();

          this.fetchedData.set(url, {
            url,
            title,
            created_date,
            clipped_date
          });
        }

        const next_eh = await page.$x(XPATH.toNextPageButtons);

        if (
          // 「次へ」ボタンを押すことができなくなったら中断
          (await (await next_eh[0].getProperty("className")).jsonValue()) === "disabled"
        ) {
          break;
        } else {
          await Promise.all([
            page.waitForNavigation({
              timeout: 60000,
              waitUntil: "load"
            }),
            await (next_eh[0] as ElementHandle<Element>).click() // 「次へ」ボタンを押す
          ]);
        }
      }

      console.log(`${JOB_NAME}: Scraping Completed!`);
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    return true;
  }

  async output() {
    const arrayData: Clip[] = [];
    for (const obj of this.fetchedData.values()) {
      arrayData.push(obj);
    }
    const jsonData = JSON.stringify(arrayData, null, "  ");

    try {
      await fs.writeFile(`./${CSV_FILENAME}.csv`, papa.unparse(jsonData), (e) => {
        if (e) console.log("error: ", e);
      });
    } catch (e) {
      console.log("error: ", e.message);
      return false;
    }
    console.log(`${JOB_NAME}: CSV Output Completed!`);
    return true;
  }
}

(async () => {
  const startTime = Date.now();

  const browser = await puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    // devtools: true,
    slowMo: 120
  });

  const seiga = new Seiga();

  await seiga.login(browser);
  await seiga.scraper(browser);

  await seiga.output(); //ファイル出力

  console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

  await browser.close();
})();
