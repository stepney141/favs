import fs from "node:fs/promises";
import path from "path";

import { config } from "dotenv";
import papa from "papaparse";
import puppeteer from "puppeteer";

import { USER_AGENT } from "../.libs/constants";

import type { Browser, ElementHandle } from "puppeteer";

const baseURI = "https://note.com";
const JOB_NAME = "note.com Favorites";
const CSV_FILENAME = "note_favorites";

const XPATH = {
  useridInput: '//*[@id="email"]',
  passwordInput: '//*[@id="password"]',
  loginButton: '//button[@data-type="primary"]'
};

config({ path: path.join(__dirname, "../.env") });
const user_name = process.env.NOTE_ACCOUNT!.toString();
const password = process.env.NOTE_PASSWORD!.toString();

type Note = {
  note_title: string;
  note_url: string;
  user_nickname: string;
  publish_at: string;
  like_count: number;
};
type NoteApiEntry = {
  key: string;
  name: string;
  note_url: string;
  user: {
    nickname: string;
  };
  publish_at: string;
  like_count: number;
};
type NoteApiResponse = {
  last_page: boolean;
  notes: NoteApiEntry[];
};

class notebook {
  page_num: number;
  favedArticlesData: Map<string, Note>;
  favedArticlesData_Array: Note[];

  constructor() {
    this.page_num = 1;
    this.favedArticlesData = new Map();
    this.favedArticlesData_Array = [];
  }

  async login(browser: Browser) {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
    });
    await page.setUserAgent(USER_AGENT);

    await page.goto(`${baseURI}/login`, {
      waitUntil: "load"
    });

    await page.evaluateOnNewDocument(() => {
      //webdriver.navigatorを消して自動操縦であることを隠す
      Object.defineProperty(navigator, "webdriver", () => {});
      delete navigator.__proto__.webdriver;
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
      ((await loginButton_Handle)[0] as ElementHandle<Element>).click()
    ]);

    console.log(`${JOB_NAME}: Login Completed!`);
  }

  async scraper(browser: Browser) {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
    });
    await page.setUserAgent(USER_AGENT);

    await page.evaluateOnNewDocument(() => {
      //webdriver.navigatorを消して自動操縦であることを隠す
      Object.defineProperty(navigator, "webdriver", () => {});
      delete navigator.__proto__.webdriver;
    });

    console.log(`${JOB_NAME}: Scraping Started!`);

    //イベントハンドラを登録
    // ref:
    let isLastPage: boolean = false;
    page.on("response", (response) => {
      (async () => {
        if (response.url().includes("https://note.com/api/v1/notes/liked") === true && response.status() === 200) {
          const payload = (await response.json())["data"] as NoteApiResponse;
          isLastPage = payload["last_page"];
          const notes_array = payload["notes"];

          for (const data of notes_array) {
            const key = data["key"]; //記事IDみたいなもの？(URLの固有記事名部分)
            const note_title = data["name"]; //記事名
            const note_url = data["note_url"]; //記事URL
            const user_nickname = data["user"]["nickname"]; //記事作成者名
            const publish_at = data["publish_at"]; //公開時刻
            const like_count = data["like_count"]; //スキされた数

            this.favedArticlesData.set(key, {
              //記事ID的な何かをキーにする
              note_title: note_title,
              note_url: note_url,
              user_nickname: user_nickname,
              publish_at: publish_at,
              like_count: like_count
            });
          }
        }
      })();
    });

    //スキした記事の一覧へ飛んで処理を実行
    await page.goto(`${baseURI}/notes/liked`, {
      timeout: 1000 * 60,
      waitUntil: ["networkidle2", "domcontentloaded", "load"]
    });

    for (;;) {
      if (isLastPage) {
        break;
      } else {
        await page.evaluate(() => {
          window.scrollBy(0, 5000);
        });
      }

      await page.waitForTimeout(3000);
    }

    console.log(`${JOB_NAME}: Scraping Completed!`);
  }

  async output(arrayData) {
    const jsonData = JSON.stringify(arrayData, null, "  ");
    await fs.writeFile(`./${CSV_FILENAME}.csv`, papa.unparse(jsonData), (e) => {
      if (e) console.log("error: ", e);
    });
    console.log(`${JOB_NAME}: CSV Output Completed!`);
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: false,
      // devtools: true,
      slowMo: 80
    });

    const note = new notebook();

    await note.login(browser);
    await note.scraper(browser);

    for (const obj of note.favedArticlesData.values()) {
      //Mapの値だけ抜き出してArrayにする
      note.favedArticlesData_Array.push(obj);
    }

    await note.output(note.favedArticlesData_Array); //ファイル出力

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
