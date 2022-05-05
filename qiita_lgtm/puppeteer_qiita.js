const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
const path = require('path');
require("dotenv").config({path: path.join(__dirname, "../.env")});

// vars for qiita
const userid = "stepney141";
let page_max;
let page_num = 1;

const JOB_NAME = "Qiita LGTM Articles";
const BASE_URI = 'https://qiita.com';
const XPATH = {
    max_pagenation_value: '//div/div[2]/div[3]/div/div[2]/div/ul/li[2]/span',
    article_url: '//div/div[2]/div[3]/div/div[2]/div/article[*]/a[contains(@href, "qiita.com")]',
    article_title: '//div/div[2]/div[3]/div/div[2]/div/article[*]/h2/a',
    lgtm_count_of_article: '//div/div[2]/div[3]/div/div[2]/div/article[*]/footer/div/div[2]/span[2]',
    author: '//div/div[2]/div[3]/div/div[2]/div/article[*]/header/div/p',
    created_at: '//div/div[2]/div[3]/div/div[2]/div/article[*]/header/div/span/time' // 'dateTime'プロパティに時刻情報
};

/**
 * @type {Map<url, {title, lgtm, created_at, author}>}
 */
const lgtmArticlesData = new Map();
let lgtmArticlesData_Array = [];

// vars for twitter
// const user_name = (process.env.TWITTER_ACCOUNT).toString();
// const password = (process.env.TWITTER_PASSWORD).toString();
const user_name = "";
const password = "";

// ref: https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
const transposeArray = (a) => a[0].map((_, c) => a.map((r) => r[c]));

/**
 * Iterates like Python-zip
 * @param  {...any} args
 * @link https://python.ms/javascript--zip/
 * @example
 * const array1 = [
       'apple', 'orange', 'grape',
   ];
   const array2 = [
       'rabbit', 'dog', 'cat',
   ];
   const array3 = [
       'car', 'bicycle', 'airplane',
   ];
   for (let [elm1, elm2, elm3] of zip(array1, array2, array3)) {
       console.log(elm1, elm2, elm3);
   }
 */
function* zip(...args) {
    
    const length = args[0].length;
    
    // 引数チェック
    for (let arr of args) {
        if (arr.length !== length){
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

async function getLgtm(browser) {
    try {
        const page = await browser.newPage();

        console.log(`${JOB_NAME}: Qiita Scraping Started!`);

        do {
            await page.goto(`${BASE_URI}/${userid}/lgtms?page=${page_num}`, {
                waitUntil: ["domcontentloaded", "networkidle0"],
            });

            // get max cursor number
            if (page_num == 1) {
                // ref: https://swfz.hatenablog.com/entry/2020/07/23/010044
                const paginationHandles = await page.$x(XPATH.max_pagenation_value);
                page_max = Number(
                    (await (await paginationHandles[0].getProperty("innerHTML")).jsonValue()).substr(-2, 2)
                );
            }

            const articleUrlHandles = await page.$x(XPATH.article_url); // get article urls
            const articleTitleHandles = await page.$x(XPATH.article_title); // get article titles
            const articleLgtmHandles = await page.$x(XPATH.lgtm_count_of_article); // get article LGTM counts
            const authorHandles = await page.$x(XPATH.author); // get author names
            const createdAtHandles = await page.$x(XPATH.created_at); // get dates that the articles were created at

            for (const [url, title, lgtm, created_at, author] of
                zip(articleUrlHandles, articleTitleHandles, articleLgtmHandles, createdAtHandles, authorHandles)) {
                lgtmArticlesData.set(url, {
                    title: await (await title.getProperty("innerHTML")).jsonValue(), //タイトル取得
                    url: await (await url.getProperty("href")).jsonValue(), //記事URL取得
                    lgtm: Number(await (await lgtm.getProperty("innerText")).jsonValue()), //記事LGTM数取得
                    created_at: await (await created_at.getProperty("dateTime")).jsonValue(), //記事投稿日時取得
                    author: await (await author.getProperty("innerText")).jsonValue(), //記事投稿者取得
                });
            }

            page_num++;

        } while (page_max >= page_num);

    } catch (e) {
        console.log(e);
        await browser.close();
        return false;
    }
    console.log(`${JOB_NAME}: Qiita Scraping Completed!`);
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
    console.log(`${JOB_NAME}: CSV Output Completed!`);
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

    for (const obj of lgtmArticlesData.values()) { //Mapの値だけ抜き出してArrayにする
        lgtmArticlesData_Array.push(obj);
    }
    await output(lgtmArticlesData_Array);

    console.log("The processsing took " + Math.round((Date.now() - startTime) / 1000) + " seconds");

    await browser.close();
})();
