import { promises as fs } from "fs";
import path from "path";

import axios from "axios";
import { config } from "dotenv";
import papa from "papaparse";
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { USER_AGENT } from './../.libs/constants';

import type { AxiosInstance } from "axios";
import type { Browser, ElementHandle} from "puppeteer";


const stealthPlugin = StealthPlugin();
/* https://github.com/berstend/puppeteer-extra/issues/668 */
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("navigator.plugins");
puppeteer.use(stealthPlugin); // use the stealth plugin

const JOB_NAME = "Zenn.dev Favorite Articles";
const baseURI = "https://zenn.dev";
const XPATH = {
  signInButton: '//button[contains(text(), "Login with Google")]',
  accountNameInput: '//*[@id="session_email_address"]',
  passwordInput: '//*[@id="session_password"]',
  loginButton: '//*[@id="js_sessions_new_form"]/form/div[4]/button',
  nextPaginationButton: '//button[contains(text(), "もっと読み込む")]'
};

config({ path: path.join(__dirname, "../.env") });
const zenn_email = process.env.ZENN_GOOGLE_ACCOUNT!.toString();
const zenn_password = process.env.ZENN_GOOGLE_PASSWORD!.toString();

// ref: https://cpoint-lab.co.jp/article/202007/15928/
const createAxiosInstance = () => {
  // axios.create でいきなり axios を呼んだ時に使われる通信部(AxiosInstance)がインスタンス化される
  const axiosInstance = axios.create({
    // この第一引数オブジェクトで設定を定義
  });

  // interceptors.response.use で返信時に引数に入れた関数が動作する
  axiosInstance.interceptors.response.use(
    (response) => response, // 第一引数は通信成功時処理。受けた内容をそのまま通過
    async (error) => {
      // 第二引数は通信失敗時処理
      throw new Error(`${error.response?.statusText} ${error.response?.config.url} ${await error.response?.data}`);
    }
  );

  // interceptor で共通処理を追加した通信機能を返す。
  return axiosInstance;
};

class Zennist {
  page_num: number;
  axios: AxiosInstance;
  favedArticlesData: Map<number, object>;
  favedArticlesData_Array: Array<object>;

  constructor() {
    this.page_num = 1;
    this.axios = createAxiosInstance();
    this.favedArticlesData = new Map();
    this.favedArticlesData_Array = [];
  }

  async login(browser: Browser) {
    try {
      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        "accept-language": "ja-JP"
      });
      await page.setUserAgent(USER_AGENT);

      /* https://github.com/berstend/puppeteer-extra/issues/668 */
      await page.setBypassCSP(true);

      const pages = await browser.pages();
      // Close the new tab that chromium always opens first.
      await pages[0].close();

      await page.goto(`${baseURI}/enter`, {
        waitUntil: "networkidle2"
      });

      // login with google
      const signInButton_Handle = page.$x(XPATH.signInButton);
      await Promise.all([
        page.waitForNavigation({
          timeout: 60000,
          waitUntil: "load"
        }),
        ((await signInButton_Handle)[0] as ElementHandle<Element>).click()
      ]);

      // input email
      console.log("Typing email ...");
      await page.type("#identifierId", zenn_email);
      await Promise.all([
        page.waitForNavigation({
          timeout: 12000,
          waitUntil: "networkidle2"
        }),
        page.keyboard.press("Enter")
      ]);

      // input password
      console.log("Typing password ...");
      const passwordInputHandle = await page.$x('//*[@id="password"]/div[1]/div/div[1]/input');
      await page.screenshot({ path: "test.png" });
      await passwordInputHandle[0].type(zenn_password);
      await Promise.all([
        page.waitForResponse((response) => {
          return response.url().includes(`${baseURI}/auth/init`) === true && response.status() === 200;
        }),
        page.keyboard.press("Enter")
      ]);
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    return true;
  }

  async scraper(browser: Browser) {
    try {
      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        "accept-language": "ja-JP"
      });
      // await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36");

      //「いいねした投稿」のスクレイピング
      page.on("response", async (response) => {
        //イベントハンドラを登録
        if (response.url().includes(`${baseURI}/api/me/library/likes`) === true && response.status() === 200) {
          const articles_array = (await response.json())["items"];
          for (const data of articles_array) {
            const key = data["id"]; //記事IDみたいなもの？(整数値)
            const title = data["title"]; //記事名
            const url = baseURI + data["path"]; //記事URL(ブラウザでアクセスする時のURLそのものではなく、記事固有のURL)
            const user_nickname = data["user"]["name"]; //記事作成者名(アカウント名ではなくスクリーンネーム)
            const published_at = data["published_at"]; //公開時刻
            const liked_count = data["liked_count"]; //スキされた数

            if (data["post_type"] !== "Comment") {
              // コメントへの「スキ」も同じページに表示されるが、これは不要なので弾く
              this.favedArticlesData.set(key, {
                //記事ID的な何かをキーにする
                note_title: title,
                note_url: url,
                user_nickname: user_nickname,
                published_at: published_at,
                liked_count: liked_count
              });
            }
          }
        }
      });

      await page.goto(`${baseURI}/dashboard/library`, {
        waitUntil: ["networkidle0", "domcontentloaded", "load"]
      });

      for (;;) {
        const [wait_eh, button_eh] = await Promise.all([
          page.waitForXPath(XPATH.nextPaginationButton, { timeout: 5 * 1000 }),
          page.$x(XPATH.nextPaginationButton)
        ]);
        if (wait_eh !== null) {
          await (button_eh[0] as ElementHandle<Element>).click();
        } else {
          break;
        }
      }
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    console.log(`${JOB_NAME}: Scraping Completed!`);
    return true;
  }

  async outputCSV(arrayData, filename) {
    const jsonData = JSON.stringify(arrayData, null, "  ");

    try {
      await fs.writeFile(
        `./${filename}`,
        papa.unparse(jsonData),
        // jsonData,
        (e) => {
          if (e) console.log("error: ", e);
        }
      );
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
    executablePath: executablePath(),
    defaultViewport: { width: 1000, height: 1000 },
    // args: [
    //     // '--disable-gpu',
    //     '--disable-dev-shm-usage',
    //     '--disable-setuid-sandbox',
    //     '--no-first-run',
    //     '--no-sandbox',
    //     '--no-zygote',
    //     // '--single-process'
    // ],
    slowMo: 100,
    // headless: true,
    headless: false //セキュリティコード使わずに2段階認証する時はheadfullの方が楽
  });

  const zenn = new Zennist();

  await zenn.login(browser);
  await zenn.scraper(browser);

  for (const obj of zenn.favedArticlesData.values()) {
    //Mapの値だけ抜き出してArrayにする
    zenn.favedArticlesData_Array.push(obj);
  }

  await zenn.outputCSV(zenn.favedArticlesData_Array, "zenn_faved_articles.csv");

  console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

  await browser.close();
})();
