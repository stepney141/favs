import path from "path";

import { config } from "dotenv";
import { launch } from "puppeteer";

import { getNodeProperty, randomWait, sleep, exportFile } from "../.libs/utils";

import type { Browser, ElementHandle } from "puppeteer";

const baseURI = "https://www.boundhub.com";
const JOB_NAME = "Boundhub Favorite Movies";
const PLAYLIST_NAME = "playlist01";
const CSV_FILENAME = "boundhub_faved_movies";

const XPATH = {
  useridInput: '//*[@id="login_username"]',
  passwordInput: '//*[@id="login_pass"]',
  loginButton: "/html/body/div[4]/div/div/div/div/div/form/div[2]/div[4]/input[3]",

  linkToPlaylist: `//a[contains(text(), "${PLAYLIST_NAME}")]`,
  playListHeader: '//h2[contains(text(), "My Playlist")]',
  linkToNextPage: '//li[@class="next"]/a',
  linkToAllMovies: '//*[@id="list_videos_my_favourite_videos_items"]/form/div[*]/a'
};
const SELECTOR = {
  dropdownToPlaylist: "#list_videos_my_favourite_videos > div.headline > div > span",
  linkToNextPage: "#list_videos_my_favourite_videos_pagination > div > ul > li.next > a"
};

config({ path: path.join(__dirname, "../.env") });
const user_name = process.env.BOUNDHUB_ACCOUNT!.toString();
const password = process.env.BOUNDHUB_PASSWORD!.toString();

type Movie = {
  title: string;
  url: string;
};
type MovieList = Movie[];

class BoundHub {
  #browser: Browser;
  #movielist: MovieList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#movielist = [];
  }

  async login() {
    const page = await this.#browser.newPage();
    await page.goto(`${baseURI}/?login`, {
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

    console.log(`${JOB_NAME}: Logged in!`);
    return this;
  }

  async explore() {
    const page = await this.#browser.newPage();
    await page.goto(`${baseURI}/my/favourites/videos/`, {
      waitUntil: "networkidle2"
    });

    await page.hover(SELECTOR.dropdownToPlaylist); //マウスホバーしないとプレイリストが表示されない
    const linkToPlaylist_Handle = (await page.$x(XPATH.linkToPlaylist)) as ElementHandle<Element>[];
    await Promise.all([
      page.waitForXPath(XPATH.playListHeader), // 画面の再描画を待ち受けつつ...
      linkToPlaylist_Handle[0].click() // ...プレイリストを開く
    ]);
    console.log(`${JOB_NAME}: Started to read Playlist "${PLAYLIST_NAME}"`);

    for (;;) {
      const linkToAllMovies_Handle = await page.$x(XPATH.linkToAllMovies);
      for (const data of linkToAllMovies_Handle) {
        this.#movielist.push({
          title: await getNodeProperty(data, "title"),
          url: await getNodeProperty(data, "href")
        });
      }

      // 次ページをダイレクトで取得するリンクは、DOM上は存在するが画面には表示されない。
      // XPathでは表示されていない要素を操作できないが、CSSセレクタでは可能なので、教義を破ってXPathを使っていない。
      // ref: https://stackoverflow.com/questions/55906985/how-can-i-click-displaynone-element-with-puppeteer
      const linkToNextPage_Handle = await page.$(SELECTOR.linkToNextPage);
      if (linkToNextPage_Handle !== null) {
        await Promise.all([
          page.waitForResponse((response) => {
            // console.log(response.url());
            return (
              response.url().includes("https://www.boundhub.com/my/favourites/videos/?mode=async") === true &&
              response.status() === 200
            );
          }),
          sleep(randomWait(3000, 0.5, 1.1)), //1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
          page.$eval(SELECTOR.linkToNextPage, (el) => (el as HTMLElement).click()) //次のページに移る
        ]);
      } else {
        break;
      }
    }

    console.log(`${JOB_NAME}: Finished to read!`);
    return this.#movielist;
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: "new",
      // devtools: true,
      slowMo: 20
    });

    const bd = new BoundHub(browser);
    const movielist = await bd.login().then((bd) => bd.explore());

    await exportFile({ fileName: CSV_FILENAME, payload: movielist, targetType: "csv", mode: "overwrite" }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
    });

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
