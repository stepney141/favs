const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
require("dotenv").config();

const baseURI = 'https://bookmeter.com';
const userID = '1003258';
const isBookExistXPath = '/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li';
// const booksXPath = '/html/body/div[1]/div[1]/section/div/div[1]/ul/li';
const booksUrlXPath = '/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a';
const amazonLinkXPath = '/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[4]/a';

const accountNameInputXPath = '//*[@id="session_email_address"]';
const passwordInputXPath = '//*[@id="session_password"]';
const loginButtonXPath = '//*[@id="js_sessions_new_form"]/form/div[4]/button';

const user_name = process.env.BOOKMETER_ACCOUNT;
const password = process.env.BOOKMETER_PASSWORD;

let page_num = 1;
let booksUrlData = [];
let amazonLinkData = [];
let wishBooksData = [];
        
// ref: https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
const transposeArray = a => a[0].map((_, c) => a.map((r) => r[c]));

const randomWait = (baseWaitSeconds, min, max) => baseWaitSeconds * (Math.random() * (max - min) + min);

// Amazon詳細リンクはアカウントにログインしなければ表示されないため、ログインする
async function bookmeterLogin(browser) {
    try {
        const page = await browser.newPage();

        await page.goto(`${baseURI}/login`, {
            waitUntil: "networkidle2",
        });

        const accountNameInputHandle = await page.$x(accountNameInputXPath);
        const passwordInputHandle = await page.$x(passwordInputXPath);
        const loginButtonHandle = await page.$x(loginButtonXPath);

        await accountNameInputHandle[0].type(user_name);
        await passwordInputHandle[0].type(password);
        await loginButtonHandle[0].click();
        
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

async function bookmeterScraper(browser) {
    try {
        const page = await browser.newPage();

        do {
            await page.goto(`${baseURI}/users/${userID}/books/wish?page=${page_num}`, {
                waitUntil: "networkidle2",
            });

            // await page.waitForXPath(amazonLinkXPath);

            // 本の情報のbookmeter内部リンクを取得
            const booksUrlHandle = await page.$x(booksUrlXPath);
            for (const data of booksUrlHandle) {
                booksUrlData.push(
                    await (await data.getProperty("href")).jsonValue()
                );
            }

            //Amazon詳細ページを取得
            const amazonLinkHandle = await page.$x(amazonLinkXPath);
            for (const data of amazonLinkHandle) {
                // let amazonLinks = await (await data.getProperty("href")).jsonValue();
                amazonLinkData.push(
                    // Amazonへのリンクに含まれる余計なクエリを削除
                    // ref: http://absg.hatenablog.com/entry/2016/03/17/190831
                    // amazonLinks.replace(/ref=as_li_tf_tl\?.*$/, "")
                    (await (await data.getProperty("href")).jsonValue()).replace(/ref=as_li_tf_tl\?.*$/, "")
                );
            }

            // 1500ms ~ 4500msの間でランダムにアクセスの間隔を空ける
            await page.waitForTimeout(randomWait(3000, 0.5, 1.5));

            page_num++;

        } while (
            // XPathで本の情報を取得し、そのelementHandleに要素が存在するか否かでループの終了を判定
            await (await page.$x(isBookExistXPath)).length != 0
        );

        wishBooksData.push(booksUrlData, amazonLinkData);
        wishBooksData = transposeArray(wishBooksData);
        wishBooksData.unshift(["bookmeter_url", "amazon_url"]);

    } catch (e) {
        console.log(e);
        await browser.close();
        return false;
    }
    return true;
}

async function output(arrayData) {
    const jsonData = JSON.stringify(arrayData, null, "  ");

    try {
        await fs.writeFile(
            "./bookmeter_wish_books.csv",
            papa.unparse(jsonData),
            // jsonData,
            (e) => {
                if (e) console.log("error: ", e);
            }
        );
    } catch (e) {
        console.log("error: ", e.message);
        return false;
    }
    console.log("csv output: completed!");
    return true;
}

(async () => {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
        defaultViewport: {width: 1000, height: 1000},
        headless: true,
        // headless: false,
    });

    await bookmeterLogin(browser);
    await bookmeterScraper(browser);
    await output(wishBooksData);

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();
