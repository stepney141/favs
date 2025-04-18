import { launch } from "puppeteer";

import { CHROME_ARGS } from "../.libs/constants";
import { getNodeProperty, $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile, zip } from "../.libs/utils";

import type { Browser, ElementHandle } from "puppeteer";

const JOB_NAME = "Qiita LGTM Articles";
const CSV_FILENAME = "lgtm_article_url.csv";
const BASE_URI = "https://qiita.com";
const USER = "stepney141";
const XPATH = {
  max_pagenation_value: '//*[@id="items"]/div[2]/div[2]/div/nav/div[2]/div[2]/span[1]',
  article_url: '//h2/a[contains(@href, "qiita.com")]',
  lgtm_count_of_article: "//article/footer/div/span[2]",
  author: "//article/header/div/p",
  created_at: "//article/header/div/span/time" // 'dateTime'プロパティに時刻情報
};

type LGTM = {
  url: string;
  title: string;
  lgtm: string;
  created_at: string;
  author: string;
};
type ListLGTM = Map<ElementHandle<Node>, LGTM>;

async function getLgtm(browser: Browser): Promise<ListLGTM> {
  const page = await browser.newPage();
  const lgtmList: ListLGTM = new Map();
  let page_max = 0,
    page_num = 1;

  console.log(`${JOB_NAME}: Qiita Scraping Started!`);

  do {
    await page.goto(`${BASE_URI}/${USER}/likes?page=${page_num}`, {
      waitUntil: ["domcontentloaded", "networkidle0"]
    });

    console.log(`${JOB_NAME}: Reading page ${page_num}...`);

    // get max cursor number
    if (page_num == 1) {
      // ref: https://swfz.hatenablog.com/entry/2020/07/23/010044
      const paginationHandles = await $x(page, XPATH.max_pagenation_value);
      const page_num_string: string = await getNodeProperty(paginationHandles[0], "innerHTML");
      page_max = Number(page_num_string.substr(-2, 2));
    }

    const articleUrlHandles = await $x(page, XPATH.article_url); // get article urls
    const articleLgtmHandles = await $x(page, XPATH.lgtm_count_of_article); // get article LGTM counts
    const authorHandles = await $x(page, XPATH.author); // get author names
    const createdAtHandles = await $x(page, XPATH.created_at); // get dates that the articles were created at

    for (const [url, lgtm, created_at, author] of zip(
      articleUrlHandles,
      articleLgtmHandles,
      createdAtHandles,
      authorHandles
    )) {
      const entry: LGTM = {
        title: await getNodeProperty(url, "innerHTML"), //タイトル取得
        url: await getNodeProperty(url, "href"), //記事URL取得
        lgtm: await getNodeProperty(lgtm, "innerText"), //記事LGTM数取得
        created_at: await getNodeProperty(created_at, "dateTime"), //記事投稿日時取得
        author: await getNodeProperty(author, "innerText") //記事投稿者取得
      };

      if (Object.values(entry).some((v) => v === null || v === undefined || v === "")) {
        throw new Error("Failed to get some data...");
      }

      lgtmList.set(url, entry);
    }

    page_num++;
  } while (page_max >= page_num);

  console.log(`${JOB_NAME}: Qiita Scraping Completed!`);
  return lgtmList;
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: {
        width: 600,
        height: 700
      },
      args: CHROME_ARGS,
      headless: true
    });

    const lgtm = await getLgtm(browser);

    await exportFile({ fileName: CSV_FILENAME, payload: mapToArray(lgtm), targetType: "csv", mode: "overwrite" }).then(
      () => {
        console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
      }
    );

    console.log("The processs took " + Math.round((Date.now() - startTime) / 1000) + " seconds");

    await browser.close();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
