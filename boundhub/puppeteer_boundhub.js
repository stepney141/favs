const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
const path = require('path');
require("dotenv").config({path: path.join(__dirname, "../.env")});

const baseURI = 'https://www.boundhub.com';
const process_description = 'Boundhub Favorite Movies';
const playlist_name = 'playlist01';
const csv_filename = 'boundhub_faved_movies';

const xpath = {
  useridInput: '//*[@id="login_username"]',
  passwordInput: '//*[@id="login_pass"]',
  loginButton: '/html/body/div[4]/div/div/div/div/div/form/div[2]/div[4]/input[3]',

  linkToPlaylist: `//a[contains(text(), "${playlist_name}")]`,

  linkToNextPage: '//a[contains(text(), "Next") and @data-container-id="list_videos_my_favourite_videos_pagination"]',
  linkToAllMovies: '//*[@id="list_videos_my_favourite_videos_items"]/form/div[*]/a',
};

const user_name = (process.env.BOUNDHUB_ACCOUNT).toString();
const password = (process.env.BOUNDHUB_PASSWORD).toString();
        
// ref: https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
const transposeArray = a => a[0].map((_, c) => a.map((r) => r[c]));

const randomWait = (baseWaitSeconds, min, max) => baseWaitSeconds * (Math.random() * (max - min) + min);

const mouse_click = async (page, x, y, time) => {
  try {
    await Promise.all([
      page.mouse.move(x, y),
      page.waitForTimeout(time),
      page.mouse.click(x, y)
    ]);
    return true;
  } catch (e) {
    console.log(e);
    return false;
  }
};

async function login(browser) {
  try {
    const page = await browser.newPage();

    await page.goto(`${baseURI}/?login`, {
      waitUntil: "load",
    });

    await page.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
      Object.defineProperty(navigator, 'webdriver', ()=>{});
      delete navigator.__proto__.webdriver;
    });

    const useridInput_Handle = page.$x(xpath.useridInput);
    const passwordInput_Handle = page.$x(xpath.passwordInput);
    const loginButton_Handle = page.$x(xpath.loginButton);

    await (await useridInput_Handle)[0].type(user_name);
    await (await passwordInput_Handle)[0].type(password);
    await Promise.all([
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: "networkidle2",
      }),
      (await loginButton_Handle)[0].click(),
    ]);

  } catch (e) {
    console.log(e);
    await browser.close();
    return false;
  }
  return true;    
}

async function scraper(browser) {
  let movieData = [];
  let movieUrlData = ["movie_url"];
  let movieTitleData = ["movie_title"];
  let num = 1;

  try {
    const page = await browser.newPage();
        
    await page.goto(`${baseURI}/my/favourites/videos/`, {
      waitUntil: "load",
    });

    await page.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
      Object.defineProperty(navigator, 'webdriver', ()=>{});
      delete navigator.__proto__.webdriver;
    });

    const linkToPlaylist_Handle = page.$x(xpath.linkToPlaylist);

    await Promise.all([
      mouse_click(page, 420, 465, 1000), //ドロップダウンメニューを開く
      (await linkToPlaylist_Handle)[0].click(), //プレイリストを開く
      page.waitForTimeout(2000)
    ]);

    for (; ;) { //infinite loop
      // console.log('count', num);
      // num++;

      const linkToAllMovies_Handle = await page.$x(xpath.linkToAllMovies);
      for (const data of linkToAllMovies_Handle) {
        movieUrlData.push(
          await (await data.getProperty("href")).jsonValue() //動画の内部リンクを取得
        );
        movieTitleData.push(
          await (await data.getProperty("title")).jsonValue() //動画のタイトルを取得
        );
      }

      const linkToNextPage_Handle = await page.$x(xpath.linkToNextPage); // XPathでページネーションのリンク情報を取得し、そのelementHandleに要素が存在するか否かでループの終了を判定
      if (await linkToNextPage_Handle.length !== 0) {
        await Promise.all([
          page.waitForResponse(
            (response) => {
              // console.log(response.url());
              return response.url().includes('https://www.boundhub.com/my/favourites/videos/?mode=async') === true && response.status() === 200;
            }
          ),
          page.waitForTimeout(randomWait(3000, 0.5, 1.1)), //1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
          (await linkToNextPage_Handle)[0].click(), //次のページに移る
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
    await fs.writeFile(
      `./${csv_filename}.csv`,
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
  console.log(process_description + ": CSV Output Completed!");
  return true;
}

(async () => {
  const startTime = Date.now();

  const browser = await puppeteer.launch({
    defaultViewport: { width: 500, height: 1000 },
    headless: true,
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
