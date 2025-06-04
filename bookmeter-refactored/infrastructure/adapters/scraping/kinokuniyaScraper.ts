import puppeteer from "puppeteer";

import { $x } from "../../../../.libs/pptr-utils";
import { sleep } from "../../../../.libs/utils";

import type { BookContentScraperService } from "@/application/ports/output/bookContentScraperService";
import type { Logger } from "@/application/ports/output/logger";
import type { ISBN10 } from "@/domain/models/isbn";
import type { Result } from "@/domain/models/result";
import type { Browser, Page } from "puppeteer";

import { ScrapingError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";
import { convertISBN10To13 } from "@/domain/services/isbnService";

// XPath定義
const XPATH = {
  kinokuniya: {
    出版社内容情報: '//div[@class="career_box"]/h3[text()="出版社内容情報"]/following-sibling::p[1]',
    内容説明: '//div[@class="career_box"]/h3[text()="内容説明"]/following-sibling::p[1]',
    目次: '//div[@class="career_box"]/h3[text()="目次"]/following-sibling::p[1]'
  }
};

// Chrome起動引数
const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
  "--lang=ja-JP,ja"
];

/**
 * 紀伊國屋書店のスクレイパー実装
 */
export class KinokuniyaScraper implements BookContentScraperService {
  private readonly logger: Logger;

  /**
   * コンストラクタ
   * @param logger ロガー
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Puppeteerブラウザを初期化
   */
  private async initializeBrowser(): Promise<Browser> {
    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      args: CHROME_ARGS,
      slowMo: 15
    });

    return browser;
  }

  /**
   * 画像読み込みを無効化する
   */
  private async setupImageBlocker(page: Page): Promise<void> {
    await page.setRequestInterception(true);

    page.on("request", (interceptedRequest) => {
      if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
        void interceptedRequest.abort();
      } else {
        void interceptedRequest.continue();
      }
    });
  }

  /**
   * 紀伊國屋書店から書籍の説明を取得
   */
  async scrapeBookDescription(isbn: ISBN10): Promise<Result<string, ScrapingError>> {
    const browser = await this.initializeBrowser();

    try {
      const page = await browser.newPage();

      try {
        // 画像読み込みを無効化して高速化
        await this.setupImageBlocker(page);

        // ISBN10をISBN13に変換
        const isbn13 = convertISBN10To13(isbn);

        // 日本の書籍かどうかでURLを分岐
        const isJapaneseBook = isbn.toString().startsWith("4");
        const kinokuniyaUrl = isJapaneseBook
          ? `https://www.kinokuniya.co.jp/f/dsg-01-${isbn13}`
          : `https://www.kinokuniya.co.jp/f/dsg-02-${isbn13}`;

        this.logger.debug(`紀伊國屋書店から書籍説明を取得します: ${isbn} (${kinokuniyaUrl})`);

        // 紀伊國屋書店のページにアクセス (タイムアウト延長、waitUntil変更)
        await page.goto(kinokuniyaUrl, { waitUntil: "domcontentloaded", timeout: 120 * 1000 });

        // しばらく待機（DOMが完全に読み込まれるのを待つ）
        await sleep(1000);

        let description = "";

        // 「出版社内容情報」「内容説明」「目次」の3つの要素を取得して結合
        for (const xpath of [XPATH.kinokuniya.出版社内容情報, XPATH.kinokuniya.内容説明, XPATH.kinokuniya.目次]) {
          const elements = await $x(page, xpath);

          if (elements.length > 0) {
            try {
              const text = await page.evaluate((el) => el.textContent, elements[0]);

              if (text && text.trim()) {
                description += `${text.trim()}\n\n`;
              }
            } catch (error) {
              this.logger.warn(`要素のテキスト取得に失敗しました: ${xpath}`, { error });
              // エラーが発生しても処理を続行
            }
          }
        }

        // 説明が取得できなかった場合
        if (!description) {
          this.logger.debug(`書籍説明が見つかりませんでした: ${isbn} (${kinokuniyaUrl})`);
          return ok("");
        }

        this.logger.debug(`書籍説明を取得しました: ${isbn} (${description.length}文字)`);
        return ok(description.trim());
      } finally {
        await page.close();
      }
    } catch (error) {
      const scrapingError = new ScrapingError(
        `書籍説明の取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        `https://www.kinokuniya.co.jp/f/dsg-01-${isbn}`,
        error
      );

      this.logger.error(scrapingError.message, { error, isbn });
      return err(scrapingError);
    } finally {
      await browser.close();
    }
  }
}
