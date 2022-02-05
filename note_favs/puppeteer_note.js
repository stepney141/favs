const puppeteer = require("puppeteer");
const fs = require("fs");
const papa = require("papaparse");
const path = require('path');
require("dotenv").config({path: path.join(__dirname, "../.env")});

const baseURI = 'https://note.com';
const process_description = 'note.com Favorites';
const csv_filename = 'note_favorites';

const xpath = {
    useridInput: '//*[@id="email"]',
    passwordInput: '//*[@id="password"]',
    loginButton: '//*[@id="__layout"]/div/div[1]/main/div/div[2]/div[5]/button',
};

const user_name = (process.env.NOTE_ACCOUNT).toString();
const password = (process.env.NOTE_PASSWORD).toString();
        
// ref: https://qiita.com/kznrluk/items/790f1b154d1b6d4de398
const transposeArray = a => a[0].map((_, c) => a.map((r) => r[c]));

const randomWait = (baseWaitSeconds, min, max) => baseWaitSeconds * (Math.random() * (max - min) + min);

const mouse_click = async (page, x, y, time) => {
    try {
        await Promise.all([
            page.mouse.move(x, y),
            page.waitForTimeout(time),
            page.mouse.click(x, y)
        ]);
        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
};

class notebook {

    constructor() {
        this.page_num = 1;
        this.favedArticlesData = new Map();
        this.favedArticlesData_Array = [];
    }

    async login(browser) {
        try {
            const page = await browser.newPage();

            await page.goto(`${baseURI}/login`, {
                waitUntil: "load",
            });

            await page.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
                Object.defineProperty(navigator, 'webdriver', ()=>{});
                delete navigator.__proto__.webdriver;
            });

            const useridInput_Handle = page.$x(xpath.useridInput);
            const passwordInput_Handle = page.$x(xpath.passwordInput);
            const loginButton_Handle = page.$x(xpath.loginButton);

            await (await useridInput_Handle)[0].type(user_name);
            await (await passwordInput_Handle)[0].type(password);
            await (await loginButton_Handle)[0].click();

            await page.waitForNavigation({
                timeout: 60000,
                waitUntil: "load",
            });

            console.log(`${process_description}: Login Completed!`);

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
        
            await page.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
                Object.defineProperty(navigator, 'webdriver', ()=>{});
                delete navigator.__proto__.webdriver;
            });

            console.log(`${process_description}: Scraping Started!`);

            page.on('response', async (response) => { //イベントハンドラを登録
                if (response.url().includes('https://note.com/api/v1/notes/liked') === true && response.status() === 200) {

                    const notes_array = (await response.json())["data"]["notes"];
                    for (let data of notes_array) {

                        let key = data["key"]; //記事IDみたいなもの？(URLの固有記事名部分)
                        let note_title = data["name"]; //記事名
                        let note_url = data["note_url"]; //記事URL
                        let user_nickname = data["user"]["nickname"]; //記事作成者名
                        let publish_at = data["publish_at"]; //公開時刻
                        let like_count = data["like_count"]; //スキされた数

                        this.favedArticlesData.set(key, { //記事ID的な何かをキーにする
                            "note_title": note_title,
                            "note_url": note_url,
                            "user_nickname": user_nickname,
                            "publish_at": publish_at,
                            "like_count": like_count
                        });
                    }
                    await page.evaluate(() => { window.scrollBy(0, 5000); });

                }
            });

            await page.goto(`${baseURI}/notes/liked`, { //スキした記事の一覧へ飛んで処理雨を実行
                waitUntil: "networkidle0",
            });

            console.log(`${process_description}: Scraping Completed!`);

        } catch (e) {
            console.log(e);
            await browser.close();
            return false;
        }
        return true;
    }

    async output(arrayData) {
        const jsonData = JSON.stringify(arrayData, null, "  ");

        try {
            await fs.writeFile(
                `./${csv_filename}.csv`,
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
        console.log(`${process_description}: CSV Output Completed!`);
        return true;
    }
}

(async () => {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
        defaultViewport: { width: 500, height: 1000 },
        headless: true,
        // devtools: true,
        slowMo: 50
    });

    const note = new notebook();

    await note.login(browser);
    await note.scraper(browser);

    for (const obj of note.favedArticlesData.values()) {//Mapの値だけ抜き出してArrayにする
        note.favedArticlesData_Array.push(obj);
    }

    await note.output(note.favedArticlesData_Array); //ファイル出力

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
})();
