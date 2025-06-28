import path from "path";

import { config } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../.libs/constants";
import { getNodeProperty, waitForXPath, $x } from "../.libs/pptr-utils";
import { randomWait, sleep, exportFile } from "../.libs/utils";

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

const baseURI = "https://www.boundhub.com";
const JOB_NAME = "Boundhub Favorite Movies";
const PLAYLIST_NAME = "playlist01";
const CSV_FILENAME = "boundhub_faved_movies.csv";

const XPATH = {
  useridInput: '//*[@id="login_username"]',
  passwordInput: '//*[@id="login_pass"]',
  loginButton: "/html/body/div[4]/div/div/div/div/div/form/div[2]/div[4]/input[3]",

  linkToPlaylist: `//a[contains(text(), "${PLAYLIST_NAME}")]`,
  playListHeader: '//h2[contains(text(), "My Playlist")]',
  linkToNextPage: '//li[@class="next"]/a',
  linkToAllMovies: '//*[@id="list_videos_my_favourite_videos_items"]/form/div[*]/a',

  tagHrefs: "//div[@class='list-tags']//ul[*]/li[*]/a"
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
type Tag = {
  name: string;
  url: string;
};

class BoundHub {
  #browser: Browser;
  #movielist: MovieList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#movielist = [];
  }

  async login() {
    const page = await this.#browser.newPage();
    await page.goto(`${baseURI}/?login`, { waitUntil: "networkidle2" });
    console.log(`${JOB_NAME}: Logging in...`);

    const useridInput_Handle = await $x(page, XPATH.useridInput);
    const passwordInput_Handle = await $x(page, XPATH.passwordInput);
    const loginButton_Handle = await $x(page, XPATH.loginButton);

    await useridInput_Handle[0].type(user_name);
    await passwordInput_Handle[0].type(password);
    await Promise.all([
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: "networkidle2"
      }),
      loginButton_Handle[0].click()
    ]);

    console.log(`${JOB_NAME}: Logged in!`);
    return this;
  }

  async fetchTags() {
    const page = await this.#browser.newPage();
    await page.goto(`${baseURI}/tags/`, {
      waitUntil: "networkidle2"
    });
    console.log(`${JOB_NAME}: Fetching tags...`);

    const tagHrefs_Handle = await $x(page, XPATH.tagHrefs);
    const tags: Tag[] = [];

    for (const tagNode of tagHrefs_Handle) {
      const tagInfo = {
        name: await getNodeProperty(tagNode, "textContent"),
        url: await getNodeProperty(tagNode, "href")
      };
      tags.push(tagInfo);
      // console.log(`Found tag "${tagInfo.name}" at ${tagInfo.url}`);
    }
    tags.sort((a, b) => {
      const nameA = a.name.toUpperCase(); // 大文字小文字を無視
      const nameB = b.name.toUpperCase(); // 大文字小文字を無視
      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }
      return 0;
    });

    return tags;
  }

  async explore() {
    const page = await this.#browser.newPage();
    await page.goto(`${baseURI}/my/favourites/videos/`, {
      waitUntil: "networkidle2"
    });

    await page.hover(SELECTOR.dropdownToPlaylist); //マウスホバーしないとプレイリストが表示されない
    const linkToPlaylist_Handle = await $x(page, XPATH.linkToPlaylist);
    await Promise.all([
      waitForXPath(page, XPATH.playListHeader), // 画面の再描画を待ち受けつつ...
      linkToPlaylist_Handle[0].click() // ...プレイリストを開く
    ]);
    console.log(`${JOB_NAME}: Started to read Playlist "${PLAYLIST_NAME}"`);

    for (;;) {
      const linkToAllMovies_Handle = await $x(page, XPATH.linkToAllMovies);
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

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      args: [...CHROME_ARGS, '--proxy-server=socks5://localhost:55555'],
      // devtools: true,
      slowMo: 20
    });

    const bd = new BoundHub(browser);

    const movielist = await bd.login().then((bd) => bd.explore());
    await exportFile({ fileName: CSV_FILENAME, payload: movielist, targetType: "csv", mode: "overwrite" }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
    });

    const taglist = await bd.fetchTags();
    await exportFile({ fileName: "boundhub_tags.csv", payload: taglist, targetType: "csv", mode: "overwrite" }).then(
      () => {
        console.log(`${JOB_NAME}: Finished writing boundhub_tags.csv`);
      }
    );

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
