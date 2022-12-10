const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const process_description = "Niconico Seiga MyClips";
const csv_filename = "nicoseiga_myclips";
const loginURL = "https://account.nicovideo.jp/login?site=seiga&next_url=%2Fmy%2Fclip";

const xpath = {
  useridInput: '//*[@id="input__mailtel"]',
  passwordInput: '//*[@id="input__password"]',
  loginButton: '//*[@id="login__submit"]',
  eachIllust: '//*[@id="clip_image_list"]/div',
  eachIllustLinks: '//*[@id="clip_image_list"]//div[2]/a',
  eachIllustCreatedDates: '//*[@class="created_date bold"]',
  eachIllustClippedDates: '//*[@class="clip_date bold"]',
  toNextPageButtons: '//li/*[contains(text(), "次へ")]'
};

const user_name = process.env.NICONICO_ACCOUNT.toString();
const password = process.env.NICONICO_PASSWORD.toString();

function* zip(...args) {
  const length = args[0].length;

  // 引数チェック
  for (let arr of args) {
    if (arr.length !== length) {
      throw "Lengths of arrays are not the same.";
    }
  }

  // イテレート
  for (let index = 0; index < length; index++) {
    let elms = [];
    for (let arr of args) {
      elms.push(arr[index]);
    }
    yield elms;
  }
}

class Seiga {
  constructor() {
    this.fetchedData = new Map();
  }

  async login(browser) {
    try {
      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        "accept-language": "ja-JP"
      });
      await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36"
      );
      await page.evaluateOnNewDocument(() => {
        //webdriver.navigatorを消して自動操縦であることを隠す
        Object.defineProperty(navigator, "webdriver", () => {});
        delete navigator.__proto__.webdriver;
      });

      await page.goto(loginURL, {
        waitUntil: "load"
      });

      const useridInput_Handle = page.$x(xpath.useridInput);
      const passwordInput_Handle = page.$x(xpath.passwordInput);
      const loginButton_Handle = page.$x(xpath.loginButton);

      await (await useridInput_Handle)[0].type(user_name);
      await (await passwordInput_Handle)[0].type(password);

      await Promise.all([
        page.waitForNavigation({
          timeout: 60000,
          waitUntil: "networkidle2"
        }),
        (await loginButton_Handle)[0].click()
      ]);

      console.log(`${process_description}: Login Completed!`);
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    return true;
  }

  async scraper(browser) {
    try {
      const page = await (await browser.pages())[1];

      console.log(`${process_description}: Scraping Started!`);

      for (;;) {
        const eachIllustLinks_eh = await page.$x(xpath.eachIllustLinks);
        const createdDate_eh = await page.$x(xpath.eachIllustCreatedDates);
        const clippedDate_eh = await page.$x(xpath.eachIllustClippedDates);

        for (const [illustLink_dom, created_date_dom, clipped_date_dom] of zip(
          await eachIllustLinks_eh,
          await createdDate_eh,
          await clippedDate_eh
        )) {
          const url = await (await illustLink_dom.getProperty("href")).jsonValue();
          const title = await (await illustLink_dom.getProperty("innerText")).jsonValue();
          const created_date = await (await created_date_dom.getProperty("innerText")).jsonValue();
          const clipped_date = await (await clipped_date_dom.getProperty("innerText")).jsonValue();

          this.fetchedData.set(url, {
            url,
            title,
            created_date,
            clipped_date
          });
        }

        await page.screenshot({ path: "test.png" });

        const next_eh = await page.$x(xpath.toNextPageButtons);

        console.log(await next_eh);

        if (
          // 「次へ」ボタンを押すことができなくなったら中断
          (await (await next_eh[0].getProperty("className")).jsonValue()) === "disabled"
        ) {
          break;
        } else {
          await Promise.all([
            page.waitForNavigation({
              timeout: 60000,
              waitUntil: "load"
            }),
            (await next_eh)[0].click() // 「次へ」ボタンを押す
          ]);
        }
      }

      console.log(`${process_description}: Scraping Completed!`);
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    return true;
  }

  async output() {
    let arrayData = [];
    for (const obj of this.fetchedData.values()) {
      arrayData.push(obj);
    }
    const jsonData = JSON.stringify(arrayData, null, "  ");

    try {
      await fs.writeFile(`./${csv_filename}.csv`, papa.unparse(jsonData), (e) => {
        if (e) console.log("error: ", e);
      });
    } catch (e) {
      console.log("error: ", e.message);
      return false;
    }
    console.log(`${process_description}: CSV Output Completed!`);
    return true;
  }
}

(async () => {
  const startTime = Date.now();

  const browser = await puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    // devtools: true,
    slowMo: 120
  });

  const seiga = new Seiga();

  await seiga.login(browser);
  await seiga.scraper(browser);

  await seiga.output(); //ファイル出力

  console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

  await browser.close();
})();
