import fs from "fs";
import path from "path";

import { config } from "dotenv";
import papa from "papaparse";
import puppeteer from "puppeteer";

import { clickMouse, randomWait, transposeArray } from "../.libs/utils";

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

  linkToNextPage: '//a[contains(text(), "Next") and @data-container-id="list_videos_my_favourite_videos_pagination"]',
  linkToAllMovies: '//*[@id="list_videos_my_favourite_videos_items"]/form/div[*]/a'
};

config({ path: path.join(__dirname, "../.env") });
const user_name = process.env.BOUNDHUB_ACCOUNT!.toString();
const password = process.env.BOUNDHUB_PASSWORD!.toString();

async function login(browser: Browser) {
  try {
    const page = await browser.newPage();

    await page.goto(`${baseURI}/?login`, {
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
  } catch (e) {
    console.log(e);
    await browser.close();
    return false;
  }
  return true;
}

async function scraper(browser: Browser) {
  let movieData: string[][] = [];
  const movieUrlData = ["movie_url"];
  const movieTitleData = ["movie_title"];

  try {
    const page = await browser.newPage();

    await page.goto(`${baseURI}/my/favourites/videos/`, {
      waitUntil: "load"
    });

    await page.evaluateOnNewDocument(() => {
      //webdriver.navigatorを消して自動操縦であることを隠す
      Object.defineProperty(navigator, "webdriver", () => {});
      delete navigator.__proto__.webdriver;
    });

    const linkToPlaylist_Handle = page.$x(XPATH.linkToPlaylist);

    await Promise.all([
      clickMouse(page, 420, 465, 1000), //ドロップダウンメニューを開く
      ((await linkToPlaylist_Handle)[0] as ElementHandle<Element>).click(), //プレイリストを開く
      page.waitForTimeout(2000)
    ]);

    for (;;) {
      const linkToAllMovies_Handle = await page.$x(XPATH.linkToAllMovies);
      for (const data of linkToAllMovies_Handle) {
        movieUrlData.push(
          (await (await data.getProperty("href")).jsonValue()) as string //動画の内部リンクを取得
        );
        movieTitleData.push(
          (await (await data.getProperty("title")).jsonValue()) as string //動画のタイトルを取得
        );
      }

      const linkToNextPage_Handle = await page.$x(XPATH.linkToNextPage); // XPathでページネーションのリンク情報を取得し、そのelementHandleに要素が存在するか否かでループの終了を判定
      if (linkToNextPage_Handle.length !== 0) {
        await Promise.all([
          page.waitForResponse((response) => {
            // console.log(response.url());
            return (
              response.url().includes("https://www.boundhub.com/my/favourites/videos/?mode=async") === true &&
              response.status() === 200
            );
          }),
          page.waitForTimeout(randomWait(3000, 0.5, 1.1)), //1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
          (linkToNextPage_Handle[0] as ElementHandle<Element>).click() //次のページに移る
        ]);
      } else {
        break;
      }
    }

    movieData.push(movieTitleData, movieUrlData);
    movieData = transposeArray(movieData);
  } catch (e) {
    console.log(e);
    await browser.close();
    return false;
  }

  return movieData;
}

async function output(arrayData) {
  const jsonData = JSON.stringify(arrayData, null, "  ");

  try {
    fs.writeFile(
      `./${CSV_FILENAME}.csv`,
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
  console.log(JOB_NAME + ": CSV Output Completed!");
  return true;
}

(async () => {
  const startTime = Date.now();

  const browser = await puppeteer.launch({
    defaultViewport: { width: 500, height: 1000 },
    headless: true
    // headless: false
    // devtools: true,
    // slowMo: 20
  });

  await login(browser);
  const movie_data = await scraper(browser);
  await output(movie_data);

  console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

  await browser.close();
})();
