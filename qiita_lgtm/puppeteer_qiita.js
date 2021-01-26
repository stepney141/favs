const puppeteer = require("puppeteer");
const fs = require("fs");
require("dotenv").config();

// vars for qiita
const userid = "stepney141";
let page_max;
let page_num = 1;
let urlData = [];
let titleData = [];
let authorData = [];
let lgtmData = [];
let createdDateData = [];
let articleData = [];

// vars for twitter
const user_name = process.env.TWITTER_ACCOUNT;
const password = process.env.TWITTER_PASSWORD;

const transposeArray = (a) => a[0].map((_, c) => a.map((r) => r[c]));

async function getLgtm(browser) {
  let page = await browser.newPage();

  do {
    await page.goto(`https://qiita.com/${userid}/lgtms?page=${page_num}`, {
      waitUntil: "networkidle2",
    });

    if (page_num == 1) {
      // get max cursor number
      // ref: https://swfz.hatenablog.com/entry/2020/07/23/010044
      const elementHandles = await page.$x(
        "/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/ul/li[2]/span"
      );
      page_max = Number(
        (
          await (await elementHandles[0].getProperty("innerHTML")).jsonValue()
        ).substr(-2, 2)
      );
    }

    // get article urls
    const articleUrlHandles = await page.$x(
      '/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/div/div[2]/a[contains(@href, "qiita.com")]'
    );
    for (const data of articleUrlHandles) {
      urlData.push(await (await data.getProperty("href")).jsonValue());
    }

    // get article titles
    const articleTitleHandles = await page.$x(
      '/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/div/div[2]/a[contains(@href, "qiita.com")]'
    );
    for (const data of articleTitleHandles) {
      titleData.push(await (await data.getProperty("innerHTML")).jsonValue());
    }

    // get article authors
    const articleAuthorHandles = await page.$x(
      "/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/div/div[3]/div[1]/a"
    );
    for (const data of articleAuthorHandles) {
      authorData.push(await (await data.getProperty("innerHTML")).jsonValue());
    }

    // get article LGTM counts
    const articleLgtmHandles = await page.$x(
      "/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/div/div[3]/div[2]"
    );
    for (const data of articleLgtmHandles) {
      // lgtmData.push(Number(await page.evaluate((name) => name.innerText, data)));
      lgtmData.push(
        Number(await (await data.getProperty("innerText")).jsonValue())
      );
    }

    // get article created dates
    const articleCreatedDateHandles = await page.$x(
      "/html/body/div[1]/div[3]/div/div[2]/div/div/div[3]/div/div[3]/div[3]"
    );
    for (const data of articleCreatedDateHandles) {
      createdDateData.push(
        await (await data.getProperty("innerHTML")).jsonValue()
      );
    }

    page_num++;
  } while (page_max >= page_num);

  articleData.push(urlData, titleData, authorData, lgtmData, createdDateData);
  articleData = transposeArray(articleData);
}

// Log in to qiita before scraping in order to avoid annoying prompts that recommend creating a new account
async function qiitaLogin(browser) {
  let page = await browser.newPage();

  // Log in to qiita with twitter authorization
  await page.goto("https://qiita.com/login", {
    waitUntil: "networkidle2",
  });
  const qiitaLoginButtonHandle = await page.$x(
    "/html/body/div[1]/div/div[1]/div/div[2]/div[1]/form[2]/button"
  );
  await qiitaLoginButtonHandle[0].click();
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

async function output(data) {
  try {
    await fs.writeFile(
      "./lgtm_article_url.json",
      JSON.stringify(data, null, "  "),
      (e) => {
        if (e) console.log("error: ", e);
      }
    );
    console.log("output completed");
  } catch (e) {
    console.log(e.message);
  }
}

(async () => {
  const startTime = Date.now();

  const browser = await puppeteer.launch({
    defaultViewport: {
      width: 600,
      height: 700,
    },
    headless: true,
    // slowMo: 50,
  });

  await qiitaLogin(browser);
  await getLgtm(browser);
  await output(articleData);

  console.log(
    "The processsing took " +
      Math.round((Date.now() - startTime) / 1000) +
      " seconds"
  );

  await browser.close();
})();
