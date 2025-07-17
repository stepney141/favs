import { launch } from "puppeteer";

import { CHROME_ARGS } from "../.libs/constants";
import { getNodeProperty, $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile, zip } from "../.libs/utils";

import type { Browser } from "puppeteer";

const JOB_NAME = "Togetter Favorites";
const CSV_FILENAME = {
  togetter: "togetter_favorites.csv",
  posfie: "posfie_favorites.csv"
};

const TARGET_USER_ID = "stepney141";
const TARGET_URL = {
  togetter: `https://togetter.com/id/${TARGET_USER_ID}/favorite`,
  posfie: `https://posfie.com/@${TARGET_USER_ID}/favorite`
};

const XPATH = {
  togetter: {
    allUrls: '//div[@class="topics_box"]/ul[@class="simple_list"]/li[*]//span[@class="title"]/a',
    allTitles: '//div[@class="topics_box"]/ul[@class="simple_list"]/li[*]//span[@class="title"]//h3',
    allDatesPublished: '//time[@itemprop="datePublished"]',
    linkTolastPage: '//div[@class="pagenation"]/a[3]',
    linkToNextPage: '//div[@class="pagenation"]/a[contains(text(), "次へ")]'
  },
  posfie: {
    allUrls: '//div[@class="user_show_posts_box"]/section[*]/div/span/a',
    allTitles: '//div[@class="user_show_posts_box"]/section[*]/div/span/a/h3',
    allDatesPublished: '//time[@itemprop="datePublished"]',
    linkTolastPage: '//div[@class="pagenation"]/a[3]',
    linkToNextPage: '//div[@class="pagenation"]/a[contains(text(), "次へ")]'
  }
};

type Target = "togetter" | "posfie";
type Matome = { url: string; title: string; published_date: string };
type MatomeMap = Map<string, Matome>;

class Togetter {
  #browser: Browser;
  #matomeList: { togetter: MatomeMap; posfie: MatomeMap };

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#matomeList = {
      togetter: new Map(),
      posfie: new Map()
    };
  }

  async explore(type: Target): Promise<MatomeMap> {
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

    const url = type === "togetter" ? TARGET_URL.togetter : TARGET_URL.posfie;
    await page.goto(url, {
      waitUntil: ["domcontentloaded"]
    });

    console.log(`${JOB_NAME}: exploring ${url}`);

    const linkTolastPage = await $x(page, XPATH[type].linkTolastPage);
    const pageLength = Number(await getNodeProperty(linkTolastPage[0], "innerText"));

    console.log(`${JOB_NAME}: ${pageLength} pages found`);

    for (let i = 1; i <= pageLength; i++) {
      console.log(`Exploring page No ${i}...`);
      const allUrls = await $x(page, XPATH[type].allUrls);
      const allTitles = await $x(page, XPATH[type].allTitles);
      const allDatesPublished = await $x(page, XPATH[type].allDatesPublished);

      for (const [urlElem, titleElem, publishedDateElem] of zip(allUrls, allTitles, allDatesPublished)) {
        const url: string = await getNodeProperty(urlElem, "href");
        const title: string = await getNodeProperty(titleElem, "textContent");
        const published_date: string = await getNodeProperty(publishedDateElem, "dateTime");
        this.#matomeList[type].set(url, { url, title, published_date });
      }

      if (i < pageLength) {
        const linkToNextPage = await $x(page, XPATH[type].linkToNextPage);
        await Promise.all([
          page.waitForNavigation({ waitUntil: ["domcontentloaded"] }),
          linkToNextPage[0].click()
        ]);
      }
    }

    console.log(`${JOB_NAME}: Finished exploring ${url}`);
    return this.#matomeList[type];
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: false,
      args: CHROME_ARGS.filter((arg) => !arg.includes("single-process")),
      // devtools: true,
      slowMo: 20
    });

    const togetter = new Togetter(browser);

    for (const type of ["togetter", "posfie"] satisfies Target[]) {
      const matomeList = await togetter.explore(type);

      await exportFile({
        fileName: CSV_FILENAME[type],
        payload: mapToArray(matomeList),
        targetType: "csv",
        mode: "overwrite"
      }).then(() => {
        console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME[type]}`);
      });
    }

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
