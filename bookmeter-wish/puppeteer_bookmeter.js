const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
require("dotenv").config();

const page_num = 1;
let page_max;

async function bookmeterScraper(browser) {
    let page = await browser.newPage();

    await page.goto(`https://bookmeter.com/users/1003258/books/wish?page=${page_num}`, {
        waitUntil: "networkidle2",
    });


}

(async () => {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
        defaultViewport: {width: 1000, height: 1000},
        headless: true,
    // slowMo: 50,
    });

    await bookmeterScraper(browser);

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();
