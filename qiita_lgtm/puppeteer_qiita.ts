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
  article_url: '//h3/a[contains(@href, "qiita.com")]',
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

class QiitaScrapingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QiitaScrapingError";
  }
}

const assertXPathMatched = <T>(handles: T[], fieldName: string, pageNum: number): T[] => {
  if (handles.length === 0) {
    throw new QiitaScrapingError(`XPath "${fieldName}" matched 0 elements on page ${pageNum}.`);
  }

  return handles;
};

const assertSameLength = (counts: Record<string, number>, pageNum: number): void => {
  const entries = Object.entries(counts);
  const distinctCounts = new Set(entries.map(([, count]) => count));

  if (distinctCounts.size <= 1) {
    return;
  }

  const details = entries.map(([name, count]) => `${name}=${count}`).join(", ");
  throw new QiitaScrapingError(`XPath result counts do not match on page ${pageNum}: ${details}.`);
};

const assertRequiredText = (value: string, fieldName: keyof LGTM, pageNum: number, rowNum: number): string => {
  if (value === "") {
    throw new QiitaScrapingError(`Field "${fieldName}" was empty on page ${pageNum}, row ${rowNum}.`);
  }

  return value;
};

const parsePaginationMax = (rawValue: string, pageNum: number): number => {
  const match = rawValue.match(/\d+$/);
  if (match === null) {
    throw new QiitaScrapingError(`Failed to parse the max pagination value on page ${pageNum}: "${rawValue}".`);
  }

  return Number(match[0]);
};

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
      const paginationHandles = assertXPathMatched(
        await $x(page, XPATH.max_pagenation_value),
        "max_pagenation_value",
        page_num
      );
      const page_num_string: string = await getNodeProperty(paginationHandles[0], "innerHTML");
      page_max = parsePaginationMax(page_num_string, page_num);
    }

    const articleUrlHandles = assertXPathMatched(await $x(page, XPATH.article_url), "article_url", page_num);
    const articleLgtmHandles = assertXPathMatched(
      await $x(page, XPATH.lgtm_count_of_article),
      "lgtm_count_of_article",
      page_num
    );
    const authorHandles = assertXPathMatched(await $x(page, XPATH.author), "author", page_num);
    const createdAtHandles = assertXPathMatched(await $x(page, XPATH.created_at), "created_at", page_num);

    assertSameLength(
      {
        article_url: articleUrlHandles.length,
        lgtm_count_of_article: articleLgtmHandles.length,
        created_at: createdAtHandles.length,
        author: authorHandles.length
      },
      page_num
    );

    let rowNum = 0;
    for (const [url, lgtm, created_at, author] of zip([
      articleUrlHandles,
      articleLgtmHandles,
      createdAtHandles,
      authorHandles
    ])) {
      rowNum++;
      const entry: LGTM = {
        title: assertRequiredText(await getNodeProperty(url, "innerHTML"), "title", page_num, rowNum),
        url: assertRequiredText(await getNodeProperty(url, "href"), "url", page_num, rowNum),
        lgtm: assertRequiredText(await getNodeProperty(lgtm, "innerText"), "lgtm", page_num, rowNum),
        created_at: assertRequiredText(await getNodeProperty(created_at, "dateTime"), "created_at", page_num, rowNum),
        author: assertRequiredText(await getNodeProperty(author, "innerText"), "author", page_num, rowNum).replace(/\s+/g, " ")
      };

      lgtmList.set(url, entry);
    }

    page_num++;
  } while (page_max >= page_num);

  if (lgtmList.size === 0) {
    throw new QiitaScrapingError("No Qiita LGTM entries were collected.");
  }

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
