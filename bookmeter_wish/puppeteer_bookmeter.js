const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
const axios = require("axios");
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

// ref: https://regexr.com/3gk2s
// ref: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11143609671
const amazon_asin_regex = /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/;

// ref: http://absg.hatenablog.com/entry/2016/03/17/190831
const amazon_regex = /(^https:\/\/www.amazon.co.jp\/dp\/product\/)(.+)(?=\/ref=as_li_tf_tl\?.*$)/;
const amazon_domain_regex = /^https:\/\/www.amazon.co.jp\/dp\/product\//;
const amazon_query_regex = /\/ref=as_li_tf_tl\?.*$/;

const user_name = process.env.BOOKMETER_ACCOUNT;
const password = process.env.BOOKMETER_PASSWORD;

// ref: https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
const transposeArray = a => a[0].map((_, c) => a.map((r) => r[c]));

// ref: https://qiita.com/albno273/items/c2d48fdcbf3a9a3434db
const sleep = async (time) => new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, time); });

const randomWait = (baseWaitSeconds, min, max) => baseWaitSeconds * (Math.random() * (max - min) + min);

class bookmaker {

    constructor() {
        this.page_num = 1;
        this.book_urls = ["bookmeter_url"];
        this.asins_in_amazon_link = ["asin_or_isbn"];
        this.book_titles = ["book_title"];
        this.book_publishers = ["publisher"];
        this.book_authors = ["author"];
        this.wishBooksData = [];
    }

    // Amazon詳細リンクはアカウントにログインしなければ表示されないため、ログインする
    async bookmeterLogin(browser) {
        try {
            const page = await browser.newPage();

            await page.goto(`${baseURI}/login`, {
                waitUntil: "networkidle2",
            });

            const accountNameInputHandle = page.$x(accountNameInputXPath);
            const passwordInputHandle = page.$x(passwordInputXPath);
            const loginButtonHandle = page.$x(loginButtonXPath);

            await (await accountNameInputHandle)[0].type(user_name);
            await (await passwordInputHandle)[0].type(password);
            await (await loginButtonHandle)[0].click();
        
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

    async bookmeterScraper(browser) {
        try {
            const page = await browser.newPage();

            do {
                await page.goto(`${baseURI}/users/${userID}/books/wish?page=${this.page_num}`, {
                    waitUntil: "networkidle2",
                });

                const booksUrlHandle = page.$x(booksUrlXPath);
                const amazonLinkHandle = page.$x(amazonLinkXPath);

                for (const data of await booksUrlHandle) { // 本の情報のbookmeter内部リンクを取得
                    this.book_urls.push(
                        await (await data.getProperty("href")).jsonValue()
                    );
                }
                for (const data of await amazonLinkHandle) { //Amazon詳細ページを取得
                    this.asins_in_amazon_link.push(
                    // Amazonへのリンクに含まれるISBN/ASINを抽出
                    // (await (await data.getProperty("href")).jsonValue()).replace(amazon_query_regex, "").replace(amazon_domain_regex, "")
                        String((await (await data.getProperty("href")).jsonValue()).match(amazon_asin_regex))
                    );
                }

                // 1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
                // await page.waitForTimeout(randomWait(3000, 0.5, 1.1));

                this.page_num++;

            } while (
            // XPathで本の情報を取得し、そのelementHandleに要素が存在するか否かでループの終了を判定
                await (await page.$x(isBookExistXPath)).length != 0
            );

        } catch (e) {
            console.log(e);
            await browser.close();
            return false;
        }
        console.log("Bookmeter Wished Books: Bookmeter Scraping Completed");
        return true;
    }

    async fetchOpenId(isbn_data) {
        if (isbn_data !== null) {
            try {
                const response = await axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn_data}`);
                // console.log(response.data[0]);
                if (response.data[0] === null) {
                    const status_text = "Not_found_with_Amazon_or_OpenBD";
                    this.book_publishers.push(status_text);
                    this.book_authors.push(status_text);
                    this.book_titles.push(status_text);
                } else {
                    this.book_publishers.push(response.data[0].summary.publishers);
                    this.book_authors.push(response.data[0].summary.author);
                    this.book_titles.push(response.data[0].summary.title);
                }
            } catch (e) {
                console.log(e);
            }
        }
        console.log("Bookmeter Wished Books: OpenBD Searching Completed");
    }

    configArray() {
        this.wishBooksData.push(this.book_urls, this.asins_in_amazon_link, this.book_titles, this.book_publishers, this.book_authors);
        console.log(this.book_urls.length, this.asins_in_amazon_link.length, this.book_titles.length, this.book_publishers.length, this.book_authors.length);
        this.wishBooksData = transposeArray(this.wishBooksData);
    }

    async output(arrayData) {
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
        console.log("Bookmeter Wished Books: CSV Output Completed!");
        return true;
    }

}

(async () => {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
        defaultViewport: {width: 1000, height: 1000},
        headless: true,
        // headless: false,
    });

    const book = new bookmaker();

    await book.bookmeterLogin(browser);
    await book.bookmeterScraper(browser);
    for (const isbn_data of book.asins_in_amazon_link) {
        await book.fetchOpenId(isbn_data);
        // 1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
        await sleep(randomWait(3000, 0.5, 1.1));
    }
    book.configArray();
    await book.output(book.wishBooksData);

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();
