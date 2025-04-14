import path from "path";

import { config } from "dotenv";
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile } from "../.libs/utils";

import { CHROME_ARGS, USER_AGENT } from "./../.libs/constants";

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

const JOB_NAME = "Zenn.dev Favorite Articles";
const CSV_FILENAME = "zenn_faved_articles.csv";
const baseURI = "https://zenn.dev";
const XPATH = {
  signInButton: '//button[contains(text(), "Googleでログイン")]',
  accountNameInput: '//*[@id="session_email_address"]',
  passwordInput: '//*[@id="password"]/div[1]/div/div[1]/input',
  loginButton: '//*[@id="js_sessions_new_form"]/form/div[4]/button',
  nextPaginationButton: '//button[contains(text(), "もっと読み込む")]'
};

config({ path: path.join(__dirname, "../.env") });
const zenn_email = process.env.ZENN_GOOGLE_ACCOUNT!.toString();
const zenn_password = process.env.ZENN_GOOGLE_PASSWORD!.toString();

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

class Zennist {
  #browser: Browser;
  page_num: number;
  #articleList: Map<number, ZennFaved>;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.page_num = 1;
    this.#articleList = new Map();
  }

  async login() {
    const page = await this.#browser.newPage();

    /* https://github.com/berstend/puppeteer-extra/issues/668 */
    await page.setBypassCSP(true);

    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });
    await page.setUserAgent(USER_AGENT);

    await page.goto(`${baseURI}/enter`, {
      waitUntil: "domcontentloaded"
    });

    // login with google
    const signInButton_Handle = $x(page, XPATH.signInButton);
    await Promise.all([
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: ["networkidle0", "domcontentloaded", "load"]
      }),
      (await signInButton_Handle)[0].click()
    ]);

    // input email
    console.log("Typing email ...");
    await page.type("#identifierId", zenn_email);
    await Promise.all([
      page.waitForNavigation({
        timeout: 12000,
        waitUntil: ["networkidle0", "domcontentloaded", "load"]
      }),
      page.keyboard.press("Enter")
    ]);

    // input password
    console.log("Typing password ...");
    const passwordInputHandle = await $x(page, XPATH.passwordInput);
    await page.screenshot({ path: "test.png" });
    await passwordInputHandle[0].type(zenn_password);
    await Promise.all([
      page.waitForResponse((response) => {
        return response.url().includes(`${baseURI}/auth/init`) === true && response.status() === 200;
      }),
      page.keyboard.press("Enter")
    ]);

    return this;
  }

  async explore() {
    const page = await this.#browser.newPage();

    await page.setExtraHTTPHeaders({ "accept-language": "ja-JP" });
    await page.setUserAgent(USER_AGENT);

    //「いいねした投稿」のスクレイピング
    page.on("response", (response) => {
      // https://stackoverflow.com/questions/63488141/promise-returned-in-function-argument-where-a-void-return-was-expected
      (async () => {
        if (response.url().includes(`${baseURI}/api/me/library/likes`) === true && response.status() === 200) {
          const zenn_api_response = (await response.json()) as ZennApiEntry;
          const articles_array = zenn_api_response["items"];

          for (const data of articles_array) {
            const key = data["id"]; //記事IDみたいなもの？(整数値)
            const title = data["title"]; //記事名
            const url = baseURI + data["path"]; //記事URL(ブラウザでアクセスする時のURLそのものではなく、記事固有のURL)
            const username = data["user"]["name"]; //記事作成者名(アカウント名ではなくスクリーンネーム)
            const published_at = data["published_at"]; //公開時刻
            const liked_count = data["liked_count"]; //スキされた数

            if (data["post_type"] !== "Comment") {
              // コメントへの「スキ」もいいね画面に表示されるが、これは不要なので弾く
              this.#articleList.set(key, {
                //記事ID的な何かをキーにする
                title: title,
                url: url,
                username: username,
                published_at: published_at,
                liked_count: liked_count
              });
            }
          }
        }
      })();
    });

    await page.goto(`${baseURI}/dashboard/library?type=liked_items`, {
      waitUntil: ["networkidle0", "domcontentloaded", "load"]
    });
    console.log(`${JOB_NAME}: Started to fetch!`);

    for (;;) {
      const button_eh = await $x(page, XPATH.nextPaginationButton);
      if (button_eh.length !== 0) {
        await button_eh[0].click();
      } else {
        break;
      }
    }

    console.log(`${JOB_NAME}: Scraping Completed!`);
    return this.#articleList;
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
      executablePath: executablePath(),
      defaultViewport: { width: 1000, height: 1000 },
      // ref: https://github.com/puppeteer/puppeteer/issues/10144
      // ignoreHTTPSErrors: true,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        ...CHROME_ARGS,
        // '--disable-gpu',
        "--disable-blink-features=AutomationControlled" /* https://github.com/berstend/puppeteer-extra/issues/822 */,
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-zygote",
        "--single-process"
      ],
      slowMo: 100,
      headless: false //Googleの認証の問題でheadfullの方が楽
    });

    const zenn = new Zennist(browser);
    const articles = await zenn.login().then((z) => z.explore());

    await exportFile({
      fileName: CSV_FILENAME,
      payload: mapToArray(articles),
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
