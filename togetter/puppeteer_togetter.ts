import { launch } from "puppeteer";

import { CHROME_ARGS } from "../.libs/constants";
import { getNodeProperty, $x } from "../.libs/pptr-utils";
import { mapToArray, exportFile, zip } from "../.libs/utils";

import type { Browser, Page } from "puppeteer";

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

  async explore(type: Target, page: Page): Promise<MatomeMap> {
    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
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
        if (linkToNextPage.length > 0) {
          try {
            await Promise.all([
              page.waitForNavigation({
                waitUntil: ["domcontentloaded"],
                timeout: 60000
              }),
              linkToNextPage[0].click()
            ]);
          } catch (navError) {
            console.log(`Navigation error on page ${i}:`, navError);
            await page.reload({ waitUntil: ["domcontentloaded"] });
            throw new Error(`Failed to navigate to next page`);
          }
        } else {
          console.log(`No next page link found on page ${i}`);
          break;
        }
      }
    }

    console.log(`${JOB_NAME}: Finished exploring ${url}`);
    return this.#matomeList[type];
  }
}

(async () => {
  const startTime = Date.now();
  const browser = await launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    args: CHROME_ARGS.filter((arg) => !arg.includes("single-process")),
    // devtools: true,
    slowMo: 20
  });

  const togetter = new Togetter(browser);
  const page = await browser.newPage();

  try {
    for (const type of ["posfie", "togetter"] satisfies Target[]) {
      const matomeList = await togetter.explore(type, page);

      await exportFile({
        fileName: CSV_FILENAME[type],
        payload: mapToArray(matomeList),
        targetType: "csv",
        mode: "overwrite"
      }).then(() => {
        console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME[type]}`);
      });
    }
  } catch (e) {
    console.log(e);
    await page.screenshot({ path: "test.png", fullPage: true });
    try {
      await page.close();
      await browser.close();
    } catch (closeError) {
      console.log("Error during cleanup:", closeError);
    }
    process.exit(1);
  }

  await browser.close();
  console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
})();
