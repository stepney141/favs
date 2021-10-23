const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
const axios = require("axios");
const fxp = require("fast-xml-parser");
require("dotenv").config();

const bookmeter_baseURI = 'https://bookmeter.com';
const bookmeter_userID = '1003258';
const xpath = {
    isBookExist : '/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li',
    booksUrl : '/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a',
    amazonLink : '/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[4]/a',

    accountNameInput : '//*[@id="session_email_address"]',
    passwordInput : '//*[@id="session_password"]',
    loginButton : '//*[@id="js_sessions_new_form"]/form/div[4]/button',
};

// ref: http://absg.hatenablog.com/entry/2016/03/17/190831
// ref: https://regexr.com/3gk2s
// ref: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11143609671
const amazon_asin_regex = /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/;

const bookmeter_username = process.env.BOOKMETER_ACCOUNT;
const bookmeter_password = process.env.BOOKMETER_PASSWORD;
const cinii_appid = process.env.CINII_API_APPID;
const library_id = 'FA005358'; //上智大学図書館の機関ID ref: https://ci.nii.ac.jp/library/FA005358

// ref: https://qiita.com/albno273/items/c2d48fdcbf3a9a3434db
// example: await sleep(randomWait(1000, 0.5, 1.1)); 1000ms x0.5 ~ x1.1 の間でランダムにアクセスの間隔を空ける
const sleep = async (time) => new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, time); });
const randomWait = (baseWaitSeconds, min, max) => baseWaitSeconds * (Math.random() * (max - min) + min);

// ref: https://cpoint-lab.co.jp/article/202007/15928/
const createAxiosInstance = () => {
    // axios.create でいきなり axios を呼んだ時に使われる通信部(AxiosInstance)がインスタンス化される
    const axiosInstance = axios.create({
        // この第一引数オブジェクトで設定を定義
    });
 
    // interceptors.response.use で返信時に引数に入れた関数が動作する
    axiosInstance.interceptors.response.use(
        (response) => response, // 第一引数は通信成功時処理。受けた内容をそのまま通過
        async (error) => { // 第二引数は通信失敗時処理
            throw new Error(`${error.response?.statusText} ${error.response?.config.url} ${await error.response?.data}`);
        }
    );
 
    // interceptor で共通処理を追加した通信機能を返す。
    return axiosInstance;
};

class bookmaker {

    constructor() {
        this.page_num = 1;
        this.wishBooksData = new Map();
        this.wishBooksData_Array = [];
        this.axios = createAxiosInstance();
    }

    // Amazon詳細リンクはアカウントにログインしなければ表示されないため、ログインする
    async bookmeterLogin(browser) {
        try {
            const page = await browser.newPage();

            await page.goto(`${bookmeter_baseURI}/login`, {
                waitUntil: "networkidle2",
            });

            const accountNameInputHandle = page.$x(xpath.accountNameInput);
            const passwordInputHandle = page.$x(xpath.passwordInput);
            const loginButtonHandle = page.$x(xpath.loginButton);

            await (await accountNameInputHandle)[0].type(bookmeter_username);
            await (await passwordInputHandle)[0].type(bookmeter_password);
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
                await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/wish?page=${this.page_num}`, {
                    waitUntil: "networkidle2",
                });

                const booksUrlHandle = await page.$x(xpath.booksUrl);
                const amazonLinkHandle = await page.$x(xpath.amazonLink);

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
                if (await (await page.$x(xpath.isBookExist)).length == 0) {
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
                const response = await this.axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn_data}`);

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
                        ...(this.wishBooksData.get(key)),
                        "book_title": status_text,
                        "author": status_text,
                        "publisher": status_text,
                        "published_date": status_text
                    });
                }
            } else { //異常系(与えるべきISBN自体がない)
                const status_text = "Not_found_with_Amazon";
                this.wishBooksData.set(key, {
                    ...(this.wishBooksData.get(key)),
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
        const response = await this.axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn_data}`); //xml形式でレスポンスが返ってくる
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
                const response = await this.axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn_data}`); //xml形式でレスポンスが返ってくる
                const json_resp = fxp.parse(response.data, { "arrayMode": true }); //xmlをjsonに変換
                const fetched_data = json_resp.rss[0].channel[0];

                if ("item" in fetched_data) { //正常系(該当書籍発見)
                    this.wishBooksData.set(key, { //該当件数に関わらず、とりあえず配列の先頭にあるやつだけをチェックする
                        ...(this.wishBooksData.get(key)),
                        "book_title": fetched_data.item[0]['title'],
                        "author": fetched_data.item[0]['author'],
                        "publisher": fetched_data.item[0]['dc:publisher'],
                        "published_date": fetched_data.item[0]['pubDate']
                    });
                } else { //異常系(該当書籍なし)
                    const status_text = "Not_found_with_NDL";
                    this.wishBooksData.set(key, {
                        ...(this.wishBooksData.get(key)),
                        "book_title": status_text,
                        "author": status_text,
                        "publisher": status_text,
                        "published_date": status_text
                    });
                }
            } else { //異常系(与えるべきISBNがない)
                const status_text = "Not_found_with_Amazon";
                this.wishBooksData.set(key, {
                    ...(this.wishBooksData.get(key)),
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

    async searchSph(key, books_obj) {
        const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

        try {
            if (isbn_data !== "null") { //正常系(与えるべきISBNがある)
                const response = await this.axios.get(`https://ci.nii.ac.jp/books/opensearch/search?appid=${cinii_appid}&format=json&fano=${library_id}&isbn=${isbn_data}`);
                const total_results = response.data["@graph"][0]["opensearch:totalResults"];

                this.wishBooksData.set(key, {
                    ...(this.wishBooksData.get(key)),
                    "exist_in_sophia": (total_results === "0") ? "No" : "Yes" //検索結果が0件なら「No」、それ以外なら「Yes」
                });

            } else { //異常系(与えるべきISBN自体がない)
                this.wishBooksData.set(key, {
                    ...(this.wishBooksData.get(key)),
                    "exist_in_sophia": (this.wishBooksData.get(key))["book_title"] //とりあえず"book_title"の中にエラーメッセージ入っとるやろ！の精神
                });
            }
        } catch (e) {
            console.log(e);
        }
    }

    async fetchBiblioInfo() {
        for (const [key, value] of this.wishBooksData) {
            await this.searchOpenBD(key, value);
            // await sleep(1000);
        }
        console.log("Bookmeter Wished Books: OpenBD Searching Completed");

        for (const [key, value] of this.wishBooksData) {
            if (value["book_title"] === "Not_found_with_OpenBD") {
                await this.searchNDL(key, value);
                await sleep(1000);
            }
        }
        console.log("Bookmeter Wished Books: NDL Searching Completed");

        for (const [key, value] of this.wishBooksData) {
            await this.searchSph(key, value);
            await sleep(1000);
        }
        console.log("Bookmeter Wished Books: Sophia-Univ. Library Searching Completed");
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
