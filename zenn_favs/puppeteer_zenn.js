const puppeteer = require("puppeteer-extra");
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require("fs").promises;
const papa = require("papaparse");
const axios = require("axios");
const path = require('path');
require("dotenv").config({path: path.join(__dirname, "../.env")});

const JOB_NAME = 'Zenn.dev Favorite Articles';
const baseURI = 'https://zenn.dev';
const XPATH = {
    signInButton: '//*[@id="__next"]/div[1]/div[2]/div/div[2]/button',
    accountNameInput : '//*[@id="session_email_address"]',
    passwordInput : '//*[@id="session_password"]',
    loginButton: '//*[@id="js_sessions_new_form"]/form/div[4]/button',
    nextPaginationButton: '//*[@id="__next"]/article/div/section/div[2]/div/div/button',
};

const zenn_email = process.env.ZENN_GOOGLE_ACCOUNT;
const zenn_password = process.env.ZENN_GOOGLE_PASSWORD;

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

class Zennist {

    constructor() {
        this.page_num = 1;
        this.axios = createAxiosInstance();
        this.favedArticlesData = new Map();
        this.favedArticlesData_Array = [];
    }

    async login(browser) {
        try {
            const page = await browser.newPage();

            const pages = await browser.pages();
            // Close the new tab that chromium always opens first.
            pages[0].close();

            await page.goto(`${baseURI}/enter`, {
                waitUntil: "networkidle2",
            });

            // login with google
            const signInButton_Handle = page.$x(XPATH.signInButton);
            await Promise.all([
                page.waitForNavigation({
                    timeout: 60000,
                    waitUntil: "load",
                }),
                (await signInButton_Handle)[0].click(),
            ]);

            // input email
            console.log('Typing email ...');
            await page.type('#identifierId', zenn_email);
            await page.waitForTimeout(1000);
            await page.keyboard.press('Enter');
            await page.waitForNavigation({
                waitUntil: "networkidle0"
            });

            // input password
            console.log('Typing password ...');
            const passwordInputHandle = page.$x('//*[@id="password"]/div[1]/div/div[1]/input');
            await (await passwordInputHandle)[0].type(zenn_password);
            await page.waitForTimeout(1000);
            await page.keyboard.press('Enter');

            await page.waitForResponse((response) => {
                return response.url().includes(`${baseURI}/auth/init`) === true && response.status() === 200;
            });

        } catch (e) {
            console.log(e);
            await browser.close();
            return false;
        }
        return true;    
    }

    async scraper(browser) {
        try {
            const page = await browser.newPage();

            //「いいねした投稿」のスクレイピング
            page.on('response', async (response) => { //イベントハンドラを登録
                if (response.url().includes(`${baseURI}/api/me/library/likes`) === true && response.status() === 200) {

                    const articles_array = (await response.json())["items"];
                    for (let data of articles_array) {

                        let key = data["id"]; //記事IDみたいなもの？(整数値)
                        let title = data["title"]; //記事名
                        let url = baseURI + data["shortlink_path"]; //記事URL(ブラウザでアクセスする時のURLそのものではなく、記事固有のURL)
                        let user_nickname = data["user"]["name"]; //記事作成者名(アカウント名ではなくスクリーンネーム)
                        let published_at = data["published_at"]; //公開時刻
                        let liked_count = data["liked_count"]; //スキされた数

                        this.favedArticlesData.set(key, { //記事ID的な何かをキーにする
                            "note_title": title,
                            "note_url": url,
                            "user_nickname": user_nickname,
                            "published_at": published_at,
                            "liked_count": liked_count
                        });
                    }

                    const nextPaginationButton_Handle = await page.$x(XPATH.nextPaginationButton);
                    if (nextPaginationButton_Handle.length !== 0) {
                        nextPaginationButton_Handle[0].click();
                    }
                }
            });

            await page.goto(`${baseURI}/dashboard/library`, {
                waitUntil: "networkidle2",
            });

        } catch (e) {
            console.log(e);
            await browser.close();
            return false;
        }
        console.log(`${JOB_NAME}: Scraping Completed!`);
        return true;
    }


    async outputCSV(arrayData, filename) {
        const jsonData = JSON.stringify(arrayData, null, "  ");

        try {
            await fs.writeFile(
                `./${filename}`,
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
        console.log(`${JOB_NAME}: CSV Output Completed!`);
        return true;
    }

    async inputCSV(filename) {
        try {
            const data = await fs.readFile(filename, "utf-8");
            const parsed_obj = papa.parse(data, {
                header: true,
                complete: (results, file) => {
                    return results;
                },
            });

            return parsed_obj.data;
        } catch (error) {
            console.error(error.message);
            process.exit(1); // 終了ステータス 1（一般的なエラー）としてプロセスを終了する
        }
    }

    async checkCSV(filename) {
        const file = await this.inputCSV(filename);

        for (const obj of file) {
            this.previousWishBooksData.set(obj['bookmeter_url'], { ...obj });
        }

        for (const key of this.wishBooksData.keys()) {
            if (this.previousWishBooksData.has(key) === false) { //ローカルのCSVとbookmeterのスクレイピング結果を比較
                console.log(`${JOB_NAME}: A diff between the local and remote is detected.`); //差分を検出した場合
                return true;
            }
        }

        console.log(`${JOB_NAME}: Cannot find a diff between the local and remote. The process will be aborted...`); //差分を検出しなかった場合
        return false;
    }
}

(async () => {
    const startTime = Date.now();

    puppeteer.use(StealthPlugin()); // use the stealth plugin

    const browser = await puppeteer.launch({
        defaultViewport: { width: 1000, height: 1000 },
        slowMo: 100,
        // headless: true,
        headless: false, //セキュリティコード使わずに2段階認証する時はheadfullの方が楽
    });

    const zenn = new Zennist();

    await zenn.login(browser);
    await zenn.scraper(browser);

    for (const obj of zenn.favedArticlesData.values()) {//Mapの値だけ抜き出してArrayにする
        zenn.favedArticlesData_Array.push(obj);
    }

    await zenn.outputCSV(zenn.favedArticlesData_Array, 'zenn_faved_articles.csv');

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();