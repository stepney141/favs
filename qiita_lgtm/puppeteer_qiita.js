const puppeteer = require("puppeteer");
const fs = require("fs");
require("dotenv").config();

// vars for qiita
const userid = "stepney141";
let page_num = 1;

// vars for twitter
const user_name = process.env.TWITTER_ACCOUNT;
const password = process.env.TWITTER_PASSWORD;

async function getLgtm(browser) {
  let page = await browser.newPage();

  await page.goto(`https://qiita.com/${userid}/lgtms?page=${page_num}`, {
    waitUntil: "domcontentloaded",
  });
  await page.screenshot({ path: `scroll-${page_num}.png` });
  const page_max = 22; // 仮設定、本来は要素を取得して数値を代入
  page_num++;

  while (page_max >= page_num) {
    await page.goto(`https://qiita.com/${userid}/lgtms?page=${page_num}`, {
      waitUntil: "domcontentloaded",
    });
    // await page.screenshot({ path: `scroll-${page_num}.png` });

    // const data = await page.$x(
    //   "/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/div/div[2]/a[2]"
    //   "/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/div[39]/div[2]/a[2]"
    // );

    page_num++;
  }
}

// Log in to qiita before scraping in order to avoid annoying prompts that recommend creating a new account
async function qiitaLogin(browser) {
  let page = await browser.newPage();

  // Log in to qiita with twitter authorization
  await page.goto("https://qiita.com/login", {
    waitUntil: "networkidle2",
  });
  const qiitaLoginButtonElement = await page.$x(
    "/html/body/div[1]/div/div[1]/div/div[2]/div[1]/form[2]/button"
  );
  await qiitaLoginButtonElement[0].click();
  await page.waitForNavigation({
    timeout: 60000,
    waitUntil: "networkidle2",
  });

  // Authorize my twitter account connected to qiita
  await page.type('input[name="session[username_or_email]"]', user_name);
  await page.type('input[name="session[password]"]', password);
  page.click('input[type="submit"]');
  await page.waitForNavigation({
    timeout: 60000,
    waitUntil: "networkidle2",
  });
}

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: {
      width: 600,
      height: 700,
    },
    headless: false,
    slowMo: 50,
  });

  await qiitaLogin(browser);
  await getLgtm(browser);

  await browser.close();
})();
