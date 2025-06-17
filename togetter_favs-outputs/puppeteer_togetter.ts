import { launch } from "puppeteer";

import { CHROME_ARGS } from "../.libs/constants";
import { getNodeProperty, $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile, zip } from "../.libs/utils";

import type { Browser } from "puppeteer";

const JOB_NAME = "Togetter Favorites";
const CSV_FILENAME = "togetter_favorites.csv";

const TARGET_USER_ID = "stepney141";
const TARGET_URL = `https://togetter.com/id/${TARGET_USER_ID}/favorite`;

const XPATH = {
  allFavorites: '//*[@id="document"]/main/div/div[4]/ul/li[*]/div',
  allUrls: '//span[@class="title"]/a[h3[@title]]',
  allTitles: "//a/h3[@title]",
  allDatesPublished: '//time[@itemprop="datePublished"]',
  linkTolastPage: '//div[@class="pagenation"]/a[3]',
  linkToNextPage: '//div[@class="pagenation"]/a[contains(text(), "次へ")]'
};

type Matome = { url: string; title: string; published_date: string };
type MatomeList = Map<string, Matome>;

class Togetter {
  #browser: Browser;
  #matomes: MatomeList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#matomes = new Map();
  }

  async explore() {
    const page = await this.#browser.newPage();

    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
    });
    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      const url = interceptedRequest.url();
      (async () => {
        if (url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".jpg:thumb")) {
          await interceptedRequest.abort();
        } else {
          await interceptedRequest.continue();
        }
      })();
    });

    await page.goto(TARGET_URL, {
      waitUntil: ["domcontentloaded"]
    });

    const linkTolastPage = await $x(page, XPATH.linkTolastPage);
    const pageLength = Number(await getNodeProperty(linkTolastPage[0], "innerText"));

    console.log(`${JOB_NAME}: ${pageLength} pages found`);

    for (let i = 1; i <= pageLength; i++) {
      console.log(`${JOB_NAME}: Exploring page No${i}...`);
      const allUrls = await $x(page, XPATH.allUrls);
      const allTitles = await $x(page, XPATH.allTitles);
      const allDatesPublished = await $x(page, XPATH.allDatesPublished);

      for (const [urlElem, titleElem, publishedDateElem] of zip(allUrls, allTitles, allDatesPublished)) {
        const url: string = await getNodeProperty(urlElem, "href");
        const title: string = await getNodeProperty(titleElem, "title");
        const published_date: string = await getNodeProperty(publishedDateElem, "dateTime");
        this.#matomes.set(url, { url, title, published_date });
      }

      if (i < pageLength) {
        const linkToNextPage = await $x(page, XPATH.linkToNextPage);
        await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), linkToNextPage[0].click()]);
      }
    }

    console.log(`${JOB_NAME}: Finished exploring ${TARGET_URL}`);
    return this.#matomes;
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      args: CHROME_ARGS,
      // devtools: true,
      slowMo: 80
    });

    const togetter = new Togetter(browser);
    const matomelist: MatomeList = await togetter.explore();

    await exportFile({
      fileName: CSV_FILENAME,
      payload: mapToArray(matomelist),
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
    });

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
