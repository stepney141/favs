import fs from "node:fs";
import path from "path";

import { config } from "dotenv";
import { unparse } from "papaparse";
import { launch } from "puppeteer";

import { USER_AGENT } from "../.libs/constants";
import { getNodeProperty, mapToArray, zip } from "../.libs/utils";

import type { ElementHandle, Page, Protocol, Browser } from "puppeteer";

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
type ClipList = Map<string, Clip>;

class Seiga {
  #browser: Browser;
  #cliplist: ClipList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#cliplist = new Map();
  }

  async login() {
    const page = await this.#browser.newPage();

    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
    });
    await page.setUserAgent(USER_AGENT);

    if (fs.existsSync(COOKIE_PATH)) {
      //cookieがあれば読み込む
      const savedCookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf-8")) as Protocol.Network.CookieParam[];
      for (const cookie of savedCookies) {
        await page.setCookie(cookie);
      }
      console.log(`${JOB_NAME}: loaded existing cookies`);
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
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(afterCookies)); //cookie更新

    console.log(`${JOB_NAME}: Login Completed!`);
    return this;
  }

  async explore() {
    const page = (await this.#browser.pages())[1];

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
        const url: string = await getNodeProperty(illustLink_dom, "href");
        const title: string = await getNodeProperty(illustLink_dom, "innerText");
        const created_date: string = await getNodeProperty(created_date_dom, "innerText");
        const clipped_date: string = await getNodeProperty(clipped_date_dom, "innerText");

        this.#cliplist.set(url, {
          url,
          title,
          created_date,
          clipped_date
        });

        // console.log(url);
      }

      const next_eh = await page.$x(XPATH.toNextPageButtons);
      const nextlink_status = await getNodeProperty(next_eh[0], "className");

      // 「次へ」ボタンを押すことができなくなったら中断
      if (nextlink_status === "disabled") {
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
    return this.#cliplist;
  }
}

function writeCSV(cliplist: ClipList) {
  const arraylist = mapToArray(cliplist);
  const jsonData = JSON.stringify(arraylist, null, "  ");
  fs.writeFileSync(`./${CSV_FILENAME}.csv`, unparse(jsonData));
  console.log(`${JOB_NAME}: CSV Output Completed!`);
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: "new",
      // devtools: true,
      slowMo: 120
    });

    const seiga = new Seiga(browser);
    const cliplist = await seiga.login().then((sg) => sg.explore());

    writeCSV(cliplist); //ファイル出力

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
