const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
require("dotenv").config();

// vars for qiita
const userid = "stepney141";
let page_max;
let page_num = 1;
let urlData = [];
let titleData = [];
let lgtmData = [];
let articleData = [];

// vars for twitter
const user_name = process.env.TWITTER_ACCOUNT;
const password = process.env.TWITTER_PASSWORD;

// ref: https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
const transposeArray = (a) => a[0].map((_, c) => a.map((r) => r[c]));

async function getLgtm(browser) {
    try {
        const page = await browser.newPage();

        do {
            await page.goto(`https://qiita.com/${userid}/lgtms?page=${page_num}`, {
                waitUntil: "networkidle2",
            });

            // get max cursor number
            if (page_num == 1) {
                // ref: https://swfz.hatenablog.com/entry/2020/07/23/010044
                const paginationHandles = await page.$x(
                    "/html/body/div[1]/div[3]/div/div[2]/div[3]/div/div[2]/div/ul/li[2]/span"
                );
                page_max = Number(
                    (await (await paginationHandles[0].getProperty("innerHTML")).jsonValue()).substr(-2, 2)
                );
            }

            // get article urls
            const articleUrlHandles = page.$x(
                '/html/body/div[1]/div[3]/div/div[2]/div[3]/div/div[2]/div/article/h2/a[contains(@href, "qiita.com")]'
            );
            // get article titles
            const articleTitleHandles = page.$x(
                '/html/body/div[1]/div[3]/div/div[2]/div[3]/div/div[2]/div/article/h2/a[contains(@href, "qiita.com")]'
            );
            // get article LGTM counts
            const articleLgtmHandles = page.$x(
                "/html/body/div[1]/div[3]/div/div[2]/div[3]/div/div[2]/div/article/footer/div/div[2]/div[1]"
            );
            
            for (const data of await articleUrlHandles) {
                urlData.push(await (await data.getProperty("href")).jsonValue());
            }
            for (const data of await articleTitleHandles) {
                titleData.push(await (await data.getProperty("innerHTML")).jsonValue());
            }
            for (const data of await articleLgtmHandles) {
                // lgtmData.push(Number(await page.evaluate((name) => name.innerText, data)));
                lgtmData.push(
                    Number(await (await data.getProperty("innerText")).jsonValue())
                );
            }

            page_num++;

        } while (page_max >= page_num);

        articleData.push(titleData, urlData, lgtmData);
        articleData = transposeArray(articleData);
        articleData.unshift(["title", "url", "likes_count"]); // insert the header into CSV

    } catch (e) {
        console.log(e);
        await browser.close();
        return false;
    }
    return true;
}

// Log in to qiita before scraping in order to avoid annoying prompts that recommend creating a new account
async function qiitaLogin(browser) {
    try {
        const page = await browser.newPage();

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
        await page.click('input[type="submit"]');
        await page.waitForNavigation({
            timeout: 60000,
            waitUntil: "networkidle2",
        });
        
    } catch (e) {
        console.log(e);
        await browser.close();
        return false;
    }
    return true;
}

async function output(arrayData) {
    try {
        const jsonData = JSON.stringify(arrayData, null, "  ");

        // await fs.writeFile(
        //     "./lgtm_article_url.json",
        //     jsonData,
        //     (e) => {
        //         if (e) console.log("error: ", e);
        //     }
        // );
        // console.log("json output: completed!");

        await fs.writeFile(
            "./lgtm_article_url.csv",
            papa.unparse(jsonData),
            (e) => {
                if (e) console.log("error: ", e);
            }
        );

    } catch (e) {
        console.log("error: ", e.message);
        return false;
    }
    console.log("Qiita LGTM Articles: CSV Output Completed!");
    return true;
}

(async () => {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
        defaultViewport: {
            width: 600,
            height: 700,
        },
        headless: true,
        // headless: false,
    });

    // await qiitaLogin(browser);
    await getLgtm(browser);
    await output(articleData);

    console.log("The processsing took " + Math.round((Date.now() - startTime) / 1000) + " seconds");

    await browser.close();
})();
