const fs = require('fs');

module.exports = class ScreenAction {
    constructor(page, logger) {
        this.page = page;
        this.logger = logger;
    }

    async page_goto(url) {
        try {
            await this.page.goto(url, { waitUntil: 'networkidle2' });
        } catch (e) {
            this.logger.fatal(e);
            process.exit(1);
        }
    }

    async click(object) {
        try {
            await Promise.all([
                this.page.click(object)
            ]);
            return true;
        } catch (e) {
            var message = 'click_error:';
            this.logger.fatal(message + e);
            return false;
        }
    }

    async click_wait(object) {
        try {
            await Promise.all([
                this.page.waitForNavigation({ waitUntil: ['load', 'networkidle2'] }),
                this.page.click(object)
            ]);
            return true;
        } catch (e) {
            var message = 'click_wait_error:';
            this.logger.fatal(message + e);
            return false;
        }
    }

    async mouse_click(x, y, time) {
        try {
            await Promise.all([
                this.page.mouse.move(x, y),
                this.page.waitForTimeout(time),
                this.page.mouse.click(x, y)
            ]);
            return true;
        } catch (e) {
            var message = 'mouse_click_error:';
            this.logger.fatal(message + e);
            return false;
        }
    }

    async mouse_click_wait(x, y, time) {
        try {
            await Promise.all([
                this.page.waitForNavigation({ waitUntil: ['load', 'networkidle2'] }),
                this.page.mouse.move(x, y),
                this.page.waitForTimeout(time),
                this.page.mouse.click(x, y)
            ]);
            var flg = true;
        } catch (e) {
            var message = 'mouse_click_wait_error:';
            this.logger.fatal(message + e);
            var flg = false;
        }
        return flg;
    }
    //スクロール
    async menu_scroll(path, y) {
        try {
            await this.page.waitForSelector(path);
            await this.page.evaluate((ey) => window.document.getElementById("app").querySelector('nav').scrollBy(0, ey), y);
        } catch (e) {
            var message = 'スクロールエラー:';
            this.logger.fatal(message + e);
            return false;
        }
        return true;
    }

    /**
 * 座標指定によるドラッグアンドドロップ
 * @param {Array<number>} from - 移動元の座標(数値の配列)
 * @param {Array<number>} to - 移動先の座標(数値の配列)
 * @param {Object} options - マウス移動イベントを発行する時間間隔・デフォルト値は{ steps: 20 }
 * @example await action.drag_and_drop([x, y], [x, y], { steps: 20 });
 */
    async drag_and_drop(from, to, options = { steps: 20 }) {
        await this.page.mouse.move(from[0], from[1]);
        await this.page.mouse.down();
        await this.page.mouse.move(to[0], to[1], options);
        await this.page.mouse.up();
    }


    // ソート一覧取得
    async list_check(elem, child_elem, date_flg = false) {
        await this.page.waitForTimeout(1000);
        var list_element = await this.page.$x(elem);
        var before_count = 0;
        var date_now = new Date();
        for (const elem of list_element.reverse()) {
            var count = await this.sort_data_convert(elem, child_elem, date_flg, date_now);
            if (before_count <= count) {
                var flg = true;
            } else {
                var flg = false;
                break;
            }
            before_count = count;
        }
        return flg;
    }

    //変換判定
    async sort_data_convert(elem, child_elem, date_flg, date_now) {
        if (date_flg) {
            let date_text = await (await (await elem.$x(child_elem))[0].getProperty('textContent')).jsonValue();
            if (date_text == '-') {
                return date_now.getTime();
            } else {
                return new Date(date_text).getTime();
            }
        } else {
            return Number(await (await (await elem.$x(child_elem))[0].getProperty('textContent')).jsonValue());
        }
    }

    //selectorでinputへ入力
    async selector_type(elem, value) {
        await this.page.waitForSelector(elem);
        var selector = await this.page.$(elem);
        await selector.type(value);
    }

    //Xpathでinputへ入力
    async xpath_type(elem, value) {
        await this.page.waitForXPath(elem);
        var xpath = await this.page.$x(elem);
        await xpath[0].type(value);
    }

    //Xpathでクリック
    async xpath_click(elem, options = {}) {
        await this.page.waitForXPath(elem);
        var xpath = await this.page.$x(elem);
        await xpath[0].click(options);
        await this.page.waitForTimeout(1000);
    }

    //xpathでsubmitクリック
    async xpath_submit(num) {
        await this.page.waitForXPath("//*[@id=\"submit\"]");
        var xpath = await this.page.$x("//*[@id=\"submit\"]");
        await xpath[num].click();
    }

    //xpathで存在チェック
    async xpath_existence_check(elem) {
        var xpath = await this.page.$x(elem);
        if (xpath[0] == undefined) {
            return false;
        } else {
            return true;
        }
    }

    //ソートのtypeの調整
    async svg_sort_check(elem, sort, click = []) {
        await this.page.waitForXPath(elem);
        while (sort != await (await (await this.page.$x(elem))[0].getProperty('textContent')).jsonValue()) {
            await this.mouse_click(click[0], click[1], 1000);
        }
    }

    //ソートのtypeの調整
    async svg_sort_xpath_check(elem, sort) {
        var click = await this.svg_sort_check_convert(elem);
        await this.page.waitForXPath(elem);
        while (sort != await (await (await this.page.$x(elem))[0].getProperty('textContent')).jsonValue()) {
            await this.xpath_click(click);
        }
    }

    //Xpathでinputへ入力
    async xpath_text(elem) {
        await this.page.waitForXPath(elem);
        var xpath = await this.page.$x(elem);
        var xpath_text = await this.page.evaluate((path) => {
            return path.textContent;
        }, xpath[0]);
        return xpath_text;
    }

    //Xpathでinputの入力を初期化
    async xpath_text_clear(elem, leng) {
        let id_length = await String(leng).length;
        await this.xpath_click(elem);//serviceID入力欄をクリック
        for (let i = 0; i < id_length; i++) {
            await this.page.keyboard.press('Backspace');//入力欄をバックスペースにより初期化
        }
    }

    //xpathからテキスト取得
    async xpath_fetch_text(elem) {
        let elementHandle = await this.page.$x(elem);
        let text = await this.page.evaluate((path) => { //一括承認画面の先頭にある端末の端末管理番号を取得
            return path.textContent;
        }, elementHandle[0]);
        return text;
    }

    //inputの文字の取得
    async get_input_value(elem) {
        var [ele] = await this.page.$x(elem);
        return await this.page.evaluate(ele => ele.value, ele);
    }

    //Xpathでinputの入力を初期化
    async xpath_value_clear(elem) {
        var id_length = await this.get_input_value(elem);
        var ele = await this.page.$x(elem);
        for (let i = 0; i < id_length.length; i++) {
            ele[0].press('Backspace');// await this.page.keyboard.press('Backspace');//入力欄をバックスペースにより初期化
        }
    }

    async svg_sort_check_convert(elem) {
        return elem.replace(/\/\/\*\[name\(\)\=\"svg\"]\/\@transform/g, '');
    }

    //CSVダウンロード
    async csv_download(x, y, time, setting_json) {
        try {
            let statusCode = 0;
            await this.page._client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: setting_json.DOWNLOAD_PATH
            });
            this.page.on('response', response => {

                statusCode = response.status(); // HTTPステータスコードを取得する

            });
            await this.mouse_click(x, y, time);
            await this.page.waitForTimeout(1000);
            if (statusCode == 500) {
                throw new Error('[StatusCode:500]ダウンロードできません');
            }
        } catch (e) {
            var error_m = 'CSVダウンロード_エラー:';
            this.logger.fatal(error_m + e);
            return false;
        }
        let filename = await ((async () => {
            let filename;
            while (!filename || filename.endsWith('.crdownload')) {
                filename = fs.readdirSync(setting_json.DOWNLOAD_PATH)[0];
            }
            return filename;
        })());
        try {
            fs.unlinkSync(setting_json.DOWNLOAD_PATH + filename);
        } catch (e) {
            this.logger.fatal("CSV削除エラー:" + e);
        }
        return true;
    }

    //終了処理
    async end_processing(browser, processingTime) {
        await browser.close();
        processingTime.endTime_logger();
        process.exit(0);
    }

    //ページ内のテキストの有無
    async search_text(tag, text) {
        const search_text = await this.page.$x(`//${tag}[contains(text(), "${text}")]`);
        if(search_text.length > 0){
            return true;
        }else{
            return false;
        }
    }
};