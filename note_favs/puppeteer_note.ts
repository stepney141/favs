import path from "path";

import { config } from "dotenv";
import { launch } from "puppeteer";

import { USER_AGENT } from "../.libs/constants";
import { sleep, mapToArray, exportFile } from "../.libs/utils";

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
type NoteList = Map<string, Note>;
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

class Notebook {
  #browser: Browser;
  #page_num: number;
  #notelist: NoteList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#page_num = 1;
    this.#notelist = new Map();
  }

  async login() {
    const page = await this.#browser.newPage();

    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
    });
    await page.setUserAgent(USER_AGENT);
    await page.goto(`${baseURI}/login`, {
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
      ((await loginButton_Handle)[0] as ElementHandle<Element>).click()
    ]);

    console.log(`${JOB_NAME}: Login Completed!`);
    return this;
  }

  async explore() {
    const page = await this.#browser.newPage();

    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
    });
    await page.setUserAgent(USER_AGENT);

    console.log(`${JOB_NAME}: Scraping Started!`);

    //イベントハンドラを登録
    let isLastPage: boolean = false;
    page.on("response", (response) => {
      (async () => {
        if (response.url().includes("https://note.com/api/v1/notes/liked") === true && response.status() === 200) {
          const internal_api_response = (await response.json()) as { data: NoteApiResponse };
          const payload = internal_api_response["data"];
          const articles = payload["notes"];
          isLastPage = payload["last_page"];

          for (const data of articles) {
            const key = data["key"]; //記事IDみたいなもの？(URLの固有記事名部分)
            const note_title = data["name"]; //記事名
            const note_url = data["note_url"]; //記事URL
            const user_nickname = data["user"]["nickname"]; //記事作成者名
            const publish_at = data["publish_at"]; //公開時刻
            const like_count = data["like_count"]; //スキされた数

            this.#notelist.set(key, {
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

      await sleep(3000);
    }

    console.log(`${JOB_NAME}: Scraping Completed!`);
    return this.#notelist;
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: false,
      // devtools: true,
      slowMo: 80
    });

    const note = new Notebook(browser);
    const notelist = await note.login().then((n) => n.explore());

    await exportFile({
      fileName: CSV_FILENAME,
      payload: mapToArray(notelist),
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
    });

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
