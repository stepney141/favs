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
        this.bookmeter_urls = ["bookmeter_url"];
        this.asins_in_amazon_link = ["asin_or_isbn"];
        this.book_titles = ["book_title"];
        this.book_publishers = ["publisher"];
        this.book_authors = ["author"];
        this.wishBooksData = new Map();
        this.wishBooksData_Array = [];
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

            for (; ;) {
                await page.goto(`${baseURI}/users/${userID}/books/wish?page=${this.page_num}`, {
                    waitUntil: "networkidle2",
                });

                const booksUrlHandle = await page.$x(booksUrlXPath);
                const amazonLinkHandle = await page.$x(amazonLinkXPath);

                for (let i = 0; i < booksUrlHandle.length; i++){
                    let bkmt_raw = await (await booksUrlHandle[i].getProperty("href")).jsonValue();
                    let bkmt = String(bkmt_raw); //本の情報のbookmeter内部リンクを取得

                    let amzn_raw = await (await amazonLinkHandle[i].getProperty("href")).jsonValue();
                    let amzn = String(amzn_raw.match(amazon_asin_regex)); //Amazonへのリンクに含まれるISBN/ASINを抽出

                    this.wishBooksData.set(bkmt, { //bookmeterの内部リンクをMapのキーにする
                        "bookmeter_url": bkmt,
                        "isbn_or_asin": amzn
                    });
                }

                // 1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
                // await page.waitForTimeout(randomWait(3000, 0.5, 1.1));

                // XPathで本の情報を取得し、そのelementHandleに要素が存在しなければループから抜ける
                if (await (await page.$x(isBookExistXPath)).length == 0) {
                    break;
                } else {
                    this.page_num++;
                }
            }
        } catch (e) {
            console.log(e);
            await browser.close();
            return false;
        }
        console.log("Bookmeter Wished Books: Bookmeter Scraping Completed");
        return true;
    }

    async fetchOpenBD(key, books_obj) {
        let isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

        if (isbn_data !== "null") { //正常系
            try {
                const response = await axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn_data}`);
                // console.log(response.data[0]);
                if (response.data[0] === null) { //異常系(OpenBDで書籍情報が見つからなかった場合)
                    const status_text = "Not_found_with_OpenBD";
                    this.wishBooksData.set(key, {
                        "bookmeter_url": key,
                        "isbn_or_asin": isbn_data,
                        "book_title": status_text,
                        "author": status_text,
                        "publisher": status_text,
                        "published_date": status_text
                    });
                } else { //正常系(OpenBDで書籍情報が見つかった場合)
                    const fetched_data = response.data[0].summary;
                    // console.log(extracted_data);
                    this.wishBooksData.set(key, {
                        "bookmeter_url": key,
                        "isbn_or_asin": isbn_data,
                        "book_title": fetched_data.title,
                        "author": fetched_data.author,
                        "publisher": fetched_data.publisher,
                        "published_date": fetched_data.pubdate
                    });
                }
            } catch (e) {
                console.log(e);
            }
        } else { //異常系(与えられたISBN自体がない場合)
            const status_text = "Not_found_with_Amazon";
            this.wishBooksData.set(key, {
                "bookmeter_url": key,
                "isbn_or_asin": isbn_data,
                "book_title": status_text,
                "author": status_text,
                "publisher": status_text,
                "published_date": status_text
            });
        }
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

    for (const [key, value] of book.wishBooksData) {
        await book.fetchOpenBD(key, value);
        // 1000ms x0.5 ~ x1.1 の間でランダムにアクセスの間隔を空ける
        // await sleep(randomWait(3000, 0.5, 1.1));
    }
    console.log("Bookmeter Wished Books: OpenBD Searching Completed");

    for (const obj of book.wishBooksData.values()) { //Mapの値だけ抜き出してArrayにする
        book.wishBooksData_Array.push(obj);
    }

    await book.output(book.wishBooksData_Array); //ファイル出力

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();
