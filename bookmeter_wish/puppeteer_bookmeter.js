const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
const axios = require("axios");
const fxp = require("fast-xml-parser");
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

// ref: http://absg.hatenablog.com/entry/2016/03/17/190831
// ref: https://regexr.com/3gk2s
// ref: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11143609671
const amazon_asin_regex = /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/;

const user_name = process.env.BOOKMETER_ACCOUNT;
const password = process.env.BOOKMETER_PASSWORD;

// ref: https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
const transposeArray = a => a[0].map((_, c) => a.map((r) => r[c]));

// ref: https://qiita.com/albno273/items/c2d48fdcbf3a9a3434db
// example: await sleep(randomWait(1000, 0.5, 1.1)); 1000ms x0.5 ~ x1.1 の間でランダムにアクセスの間隔を空ける
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

    async searchOpenBD(key, books_obj) {
        const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

        try {
            if (isbn_data !== "null") { //正常系(与えるべきISBNがある)
                const response = await axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn_data}`);

                if (response.data[0] !== null) { //正常系(該当書籍発見)
                    const fetched_data = response.data[0].summary;
                    this.wishBooksData.set(key, {
                        "bookmeter_url": key,
                        "isbn_or_asin": isbn_data,
                        "book_title": fetched_data.title,
                        "author": fetched_data.author,
                        "publisher": fetched_data.publisher,
                        "published_date": fetched_data.pubdate
                    });
                } else { //異常系(該当書籍なし)
                    const status_text = "Not_found_with_OpenBD";
                    this.wishBooksData.set(key, {
                        "bookmeter_url": key,
                        "isbn_or_asin": isbn_data,
                        "book_title": status_text,
                        "author": status_text,
                        "publisher": status_text,
                        "published_date": status_text
                    });
                }
            } else { //異常系(与えるべきISBN自体がない)
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
        } catch (e) {
            console.log(e);
        }
    }

    async test(isbn_data) {
        const response = await axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn_data}`); //xml形式でレスポンスが返ってくる
        const json_resp = fxp.parse(response.data, { "arrayMode": true }); //xmlをjsonに変換
        const fetched_data = json_resp.rss[0].channel[0];
        console.log(fetched_data);

        if ("item" in fetched_data) {
            console.log(isbn_data, 'found');
            console.log(fetched_data.item[0]['title']);
        } else {
            console.log(isbn_data, 'not-found');
        }

        const jsonData = JSON.stringify(fetched_data, null, "  ");

        try {
            await fs.writeFile(
                `./test_${isbn_data}.json`,
                jsonData,
                (e) => {
                    if (e) console.log("error: ", e);
                }
            );
        } catch (e) {
            console.log("error: ", e.message);
            return false;
        }
    }

    async searchNDL(key, books_obj) {
        const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

        try {
            if (isbn_data !== "null") { //正常系(与えるべきISBNがある)
                const response = await axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn_data}`); //xml形式でレスポンスが返ってくる
                const json_resp = fxp.parse(response.data, { "arrayMode": true }); //xmlをjsonに変換
                const fetched_data = json_resp.rss[0].channel[0];

                if ("item" in fetched_data) { //正常系(該当書籍発見)
                    this.wishBooksData.set(key, { //該当件数に関わらず、とりあえず配列の先頭にあるやつだけをチェックする
                        "bookmeter_url": key,
                        "isbn_or_asin": isbn_data,
                        "book_title": fetched_data.item[0]['title'],
                        "author": fetched_data.item[0]['author'],
                        "publisher": fetched_data.item[0]['dc:publisher'],
                        "published_date": fetched_data.item[0]['pubDate']
                    });
                } else { //異常系(該当書籍なし)
                    const status_text = "Not_found_with_NDL";
                    this.wishBooksData.set(key, {
                        "bookmeter_url": key,
                        "isbn_or_asin": isbn_data,
                        "book_title": status_text,
                        "author": status_text,
                        "publisher": status_text,
                        "published_date": status_text
                    });
                }
            } else { //異常系(与えるべきISBNがない)
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
        } catch (e) {
            console.log(e);
        }
    }

    async fetchBiblioInfo() {
        for (const [key, value] of this.wishBooksData) {
            await this.searchOpenBD(key, value);
            // await sleep(randomWait(1000, 0.5, 1.1));
        }
        console.log("Bookmeter Wished Books: OpenBD Searching Completed");

        for (const [key, value] of this.wishBooksData) {
            if (value["book_title"] === "Not_found_with_OpenBD") {
                await this.searchNDL(key, value);
                // await sleep(randomWait(1000, 0.5, 1.1));
            }
        }
        console.log("Bookmeter Wished Books: NDL Searching Completed");
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

    await book.fetchBiblioInfo(book.wishBooksData); //書誌情報取得

    for (const obj of book.wishBooksData.values()) { //Mapの値だけ抜き出してArrayにする
        book.wishBooksData_Array.push(obj);
    }

    await book.output(book.wishBooksData_Array); //ファイル出力

    // await book.test(4902666383);
    // await book.test(4758013241);
    // await book.test(null);

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();
