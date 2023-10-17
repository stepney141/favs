import fs from "fs";
import path from "path";

import { config } from "dotenv";
import papa from "papaparse";
import puppeteer from "puppeteer";

import { getNodeProperty, zip } from "../.libs/utils";

import type { Browser, ElementHandle } from "puppeteer";

const JOB_NAME = "Qiita LGTM Articles";
const CSV_FILENAME = "lgtm_article_url.csv";
const BASE_URI = "https://qiita.com";
const USER = "stepney141";
const XPATH = {
  max_pagenation_value: '//*[@id="items"]/div[2]/div[2]/div/div/div/span',
  article_url: '//h2/a[contains(@href, "qiita.com")]',
  lgtm_count_of_article: "//article/footer/div/div/span[2]",
  author: "//article/header/div/p",
  created_at: "//article/header/div/span/time" // 'dateTime'プロパティに時刻情報
};

type LGTM = {
  title: string;
  lgtm: string;
  created_at: string;
  author: string;
};
type ListLGTM = Map<ElementHandle<Node>, LGTM>;

// vars for twitter
config({ path: path.join(__dirname, "../.env") });
const user_name = process.env.TWITTER_ACCOUNT!.toString();
const password = process.env.TWITTER_PASSWORD!.toString();

const lgtmArticlesData: ListLGTM = new Map();

let page_max: number,
  page_num = 1;

async function getLgtm(browser: Browser) {
  const page = await browser.newPage();

  console.log(`${JOB_NAME}: Qiita Scraping Started!`);

  do {
    await page.goto(`${BASE_URI}/${USER}/likes?page=${page_num}`, {
      waitUntil: ["domcontentloaded", "networkidle0"]
    });

    // get max cursor number
    if (page_num == 1) {
      // ref: https://swfz.hatenablog.com/entry/2020/07/23/010044
      const paginationHandles = await page.$x(XPATH.max_pagenation_value);
      const page_num_string: string = await getNodeProperty(paginationHandles[0], "innerHTML");
      page_max = Number(page_num_string.substr(-2, 2));
    }

    const articleUrlHandles = await page.$x(XPATH.article_url); // get article urls
    const articleLgtmHandles = await page.$x(XPATH.lgtm_count_of_article); // get article LGTM counts
    const authorHandles = await page.$x(XPATH.author); // get author names
    const createdAtHandles = await page.$x(XPATH.created_at); // get dates that the articles were created at

    for (const [url, lgtm, created_at, author] of zip(
      articleUrlHandles,
      articleLgtmHandles,
      createdAtHandles,
      authorHandles
    )) {
      lgtmArticlesData.set(url, {
        title: await getNodeProperty(url, "innerHTML"), //タイトル取得
        url: await getNodeProperty(url, "href"), //記事URL取得
        lgtm: Number(await getNodeProperty(lgtm, "innerText")), //記事LGTM数取得
        created_at: await getNodeProperty(created_at, "dateTime"), //記事投稿日時取得
        author: await getNodeProperty(author, "innerText") //記事投稿者取得
      });
    }

    // console.log([...lgtmArticlesData.entries()]);

    page_num++;
  } while (page_max >= page_num);

  console.log(`${JOB_NAME}: Qiita Scraping Completed!`);
}

async function output(arrayData) {
  const jsonData = JSON.stringify(arrayData, null, "  ");
  await fs.writeFile(`./${CSV_FILENAME}`, papa.unparse(jsonData), (e) => {
    if (e) console.log("error: ", e);
  });
  console.log(`${JOB_NAME}: CSV Output Completed!`);
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
      defaultViewport: {
        width: 600,
        height: 700
      },
      headless: true
      // headless: false,
    });

    // await qiitaLogin(browser);
    await getLgtm(browser);

    await output([...lgtmArticlesData.values()]);

    console.log("The processsing took " + Math.round((Date.now() - startTime) / 1000) + " seconds");

    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
