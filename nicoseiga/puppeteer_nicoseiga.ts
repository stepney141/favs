import fs from "node:fs";
import path from "path";

import axios from "axios";
import { config } from "dotenv";
import { initializeApp } from "firebase/app";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { launch } from "puppeteer";

import { USER_AGENT } from "../.libs/constants";
import { getNodeProperty, $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile, zip, sleep, randomWait } from "../.libs/utils";

import type { Page, Protocol, Browser } from "puppeteer";

const JOB_NAME = "Niconico Seiga MyClips";
const CSV_FILENAME = "nicoseiga_myclips.csv";
const LOGIN_URL = "https://account.nicovideo.jp/login?site=seiga&next_url=%2Fmy%2Fclip";
const MYCLIP_URL = "https://seiga.nicovideo.jp/my/clip";
const COOKIE_PATH = "seiga_cookie.json";

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
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY!,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.FIREBASE_PROJECT_ID!,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.FIREBASE_APP_ID!
};

async function isNotLoggedInSeiga(page: Page) {
  const eh = await $x(page, XPATH.eachIllustLinks);
  return eh.length == 0;
}

type Clip = { url: string; title: string; created_date: string; clipped_date: string };
type ClipList = Map<string, Clip>;

const app = initializeApp(firebaseConfig); // Initialize Firebase
const storage = getStorage(app); // Initialize Cloud Storage and get a reference to the service
const pathReference = ref(storage, COOKIE_PATH);

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

    const cookieUrl = await getDownloadURL(pathReference);
    const response = await axios.get(cookieUrl); // cookieをダウンロード
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(response.data));

    if (fs.existsSync(COOKIE_PATH)) {
      //cookieがあれば読み込む
      const savedCookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf-8")) as Protocol.Network.CookieParam[];
      for (const cookie of savedCookies) {
        await page.setCookie(cookie);
      }
      console.log(`${JOB_NAME}: loaded existing cookies`);
    }

    await page
      .goto(MYCLIP_URL, {
        waitUntil: "load"
      })
      .then(() => console.log(`${JOB_NAME}: Accessing MyClip...`));

    if (await isNotLoggedInSeiga(page)) {
      console.log(`${JOB_NAME}: Revoking cookies...`);
      await page.goto(LOGIN_URL, {
        waitUntil: "networkidle2"
      });

      const useridInput_Handle = await $x(page, XPATH.useridInput);
      const passwordInput_Handle = await $x(page, XPATH.passwordInput);
      const loginButton_Handle = await $x(page, XPATH.loginButton);

      await useridInput_Handle[0].type(user_name);
      await passwordInput_Handle[0].type(password);

      await Promise.all([
        page.waitForNavigation({
          timeout: 2 * 60 * 1000,
          waitUntil: ["networkidle0", "domcontentloaded", "load"]
        }),
        loginButton_Handle[0].click()
      ]);
    }

    const afterCookies = (await page.cookies()) as unknown as string; //cookie更新
    const afterCookiesBlob = new Blob([JSON.stringify(afterCookies)], { type: "application/json" });
    // ref: https://medium.com/@dorathedev/uploading-json-objects-as-json-files-to-firebase-storage-without-having-or-creating-a-json-file-38ad323af3c4
    await uploadBytes(pathReference, afterCookiesBlob); //cookieをアップロード
    fs.unlinkSync(COOKIE_PATH);

    console.log(`${JOB_NAME}: Login Completed!`);
    return this;
  }

  async explore() {
    const page = (await this.#browser.pages())[1];
    let cnt = 1;

    console.log(`${JOB_NAME}: Scraping Started!`);

    for (;;) {
      const eachIllustLinks_eh = await $x(page, XPATH.eachIllustLinks);
      const createdDate_eh = await $x(page, XPATH.eachIllustCreatedDates);
      const clippedDate_eh = await $x(page, XPATH.eachIllustClippedDates);

      console.log(`Reading page ${cnt}`);

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
        // console.log(url, title);
      }

      cnt++;
      const next_eh = await $x(page, XPATH.toNextPageButtons);
      const nextlink_status = await getNodeProperty(next_eh[0], "className");

      // 「次へ」ボタンを押すことができなくなったら中断
      if (nextlink_status === "disabled") {
        break;
      } else {
        await Promise.all([
          page.waitForNavigation({
            timeout: 2 * 60 * 1000,
            waitUntil: ["domcontentloaded", "load"]
          }),
          sleep(randomWait(3000, 0.5, 1.1)),
          next_eh[0].click() // 「次へ」ボタンを押す
        ]);
      }
    }

    console.log(`${JOB_NAME}: Scraping Completed!`);
    return this.#cliplist;
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true, // i3wmにてヘッドフルモードで実行する場合、ブラウザのウィンドウが常に最前面に表示されていないとページ読み込みが発火しない？(未確認)
      // devtools: true,
      slowMo: 30
    });

    const seiga = new Seiga(browser);
    const cliplist = await seiga.login().then((sg) => sg.explore());

    await exportFile({
      fileName: CSV_FILENAME,
      payload: mapToArray(cliplist),
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
    });

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
