const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
require("dotenv").config();

let page_num = 1;
const baseURI = 'https://bookmeter.com';
const isBookExistXPath = '/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li';
// const booksXPath = '/html/body/div[1]/div[1]/section/div/div[1]/ul/li';
const booksUrlXPath = '/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a';
let booksUrlData = [];
        
async function bookmeterScraper(browser) {
    try {
        let page = await browser.newPage();

        do {
            await page.goto(`${baseURI}/users/1003258/books/wish?page=${page_num}`, {
                waitUntil: "networkidle2",
            });

            // 本の情報のbookmeter内部リンクを取得
            const booksUrlHandle = await page.$x(booksUrlXPath);
            for (const data of booksUrlHandle) {
                booksUrlData.push(await (await data.getProperty("href")).jsonValue());
            }

            page_num++;

        } while (
            // XPathで本の情報を取得し、そのelementHandleに要素が存在するか否かでループの終了を判定
            await (await page.$x(isBookExistXPath)).length != 0
        );
    } catch (e) {
        console.log(e);
        return false;
    }
    return true;
}

async function output(arrayData) {
    const jsonData = JSON.stringify(arrayData, null, "  ");

    try {
        await fs.writeFile(
            "./bookmeter_wish_books.csv",
            // papa.unparse(jsonData),
            jsonData,
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

    await bookmeterScraper(browser);
    await output(booksUrlData);

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();
