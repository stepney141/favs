import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../../../../.libs/constants";
import { sleep } from "../../../../.libs/utils";
import { success, failure } from "../../../domain/models/valueObjects";

import type { BrowserSession } from "../../../application/ports/output/bookScraperService";
import type { Result } from "../../../domain/models/valueObjects";
import type { Browser, Page, ElementHandle, WaitForSelectorOptions } from "puppeteer";

/**
 * Puppeteerを使用したブラウザセッション実装
 */
export class PuppeteerBrowserSession implements BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly options: PuppeteerBrowserOptions;

  /**
   * コンストラクタ
   * @param options ブラウザオプション
   */
  constructor(options: PuppeteerBrowserOptions = {}) {
    this.options = {
      headless: "new",
      slowMo: 100,
      ...options
    };

    // Stealthプラグインの設定
    const stealthPlugin = StealthPlugin();
    /* ref:
    - https://github.com/berstend/puppeteer-extra/issues/668
    - https://github.com/berstend/puppeteer-extra/issues/822
    */
    stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
    stealthPlugin.enabledEvasions.delete("navigator.plugins");
    stealthPlugin.enabledEvasions.delete("media.codecs");
    puppeteer.use(stealthPlugin);
  }

  /**
   * ブラウザを初期化する
   * @returns 初期化結果
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Puppeteerブラウザを起動
      this.browser = await puppeteer.launch({
        defaultViewport: { width: 1000, height: 1000 },
        headless: this.options.headless as boolean | undefined,
        args: CHROME_ARGS,
        slowMo: this.options.slowMo
      });

      // 新しいページを開く
      this.page = await this.browser.newPage();

      // 画像リクエストをブロックしてパフォーマンス向上
      await this.page.setRequestInterception(true);
      this.page.on("request", (interceptedRequest) => {
        (async () => {
          if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
            await interceptedRequest.abort();
          } else {
            await interceptedRequest.continue();
          }
        })();
      });

      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("ブラウザの初期化に失敗しました"));
    }
  }

  /**
   * 指定したURLにナビゲートする
   * @param url 移動先URL
   * @returns ナビゲーション結果
   */
  async navigateTo(url: string): Promise<Result<void>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // 指定したURLに移動し、ページの読み込みを待機
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 2 * 60 * 1000 // 2分のタイムアウト
      });

      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`${url}へのナビゲーションに失敗しました`));
    }
  }

  /**
   * 指定したセレクタの要素をクリックする
   * @param selector 要素のセレクタ
   * @returns クリック結果
   */
  async click(selector: string): Promise<Result<void>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // セレクタの要素が表示されるまで待機
      await this.page.waitForSelector(selector, { visible: true });

      // 要素をクリック
      await this.page.click(selector);

      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`${selector}要素のクリックに失敗しました`));
    }
  }

  /**
   * 指定したセレクタの要素にテキストを入力する
   * @param selector 要素のセレクタ
   * @param text 入力するテキスト
   * @returns 入力結果
   */
  async type(selector: string, text: string): Promise<Result<void>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // セレクタの要素が表示されるまで待機
      await this.page.waitForSelector(selector, { visible: true });

      // 一度クリアしてからテキストを入力
      await this.page.click(selector, { clickCount: 3 }); // 全選択
      await this.page.keyboard.press("Backspace"); // クリア
      await this.page.type(selector, text);

      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`${selector}要素へのテキスト入力に失敗しました`));
    }
  }

  /**
   * 指定したセレクタの要素のテキストを取得する
   * @param selector 要素のセレクタ
   * @returns テキスト取得結果
   */
  async getText(selector: string): Promise<Result<string>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // セレクタの要素が表示されるまで待機
      await this.page.waitForSelector(selector, { visible: true });

      // 要素のテキストコンテンツを取得
      const text = await this.page.$eval(selector, (el) => el.textContent || "");

      return success(text);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`${selector}要素のテキスト取得に失敗しました`));
    }
  }

  /**
   * 指定したセレクタの要素のHTML属性を取得する
   * @param selector 要素のセレクタ
   * @param attributeName 属性名
   * @returns 属性値取得結果
   */
  async getAttribute(selector: string, attributeName: string): Promise<Result<string | null>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // セレクタの要素が表示されるまで待機
      await this.page.waitForSelector(selector, { visible: true });

      // 要素の指定した属性値を取得
      const attributeValue = await this.page.$eval(selector, (el, attr) => el.getAttribute(attr), attributeName);

      return success(attributeValue);
    } catch (error) {
      return failure(
        error instanceof Error ? error : new Error(`${selector}要素の${attributeName}属性取得に失敗しました`)
      );
    }
  }

  /**
   * 指定したXPathの要素を取得する
   * @param xpath XPath式
   * @returns 要素取得結果
   */
  async getElementByXPath(xpath: string): Promise<Result<ElementHandle<Element>>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // XPathに一致する要素を待機して取得
      const elements = await this.$x(xpath);

      if (elements.length === 0) {
        return failure(new Error(`XPath ${xpath}に一致する要素が見つかりませんでした`));
      }

      return success(elements[0]);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`XPath ${xpath}の要素取得に失敗しました`));
    }
  }

  /**
   * 指定したXPathの要素のテキストを取得する
   * @param xpath XPath式
   * @returns テキスト取得結果
   */
  async getTextByXPath(xpath: string): Promise<Result<string>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // 要素を取得
      const elementResult = await this.getElementByXPath(xpath);
      if (elementResult.type === "failure") {
        return elementResult;
      }

      // テキストコンテンツを取得
      const textContent = await this.page.evaluate((el) => el.textContent || "", elementResult.value);

      return success(textContent);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`XPath ${xpath}の要素テキスト取得に失敗しました`));
    }
  }

  /**
   * 指定したXPathの要素の属性を取得する
   * @param xpath XPath式
   * @param attributeName 属性名
   * @returns 属性値取得結果
   */
  async getAttributeByXPath(xpath: string, attributeName: string): Promise<Result<string | null>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // 要素を取得
      const elementResult = await this.getElementByXPath(xpath);
      if (elementResult.type === "failure") {
        return elementResult;
      }

      // 属性値を取得
      const attributeValue = await this.page.evaluate(
        (el, attr) => el.getAttribute(attr),
        elementResult.value,
        attributeName
      );

      return success(attributeValue);
    } catch (error) {
      return failure(
        error instanceof Error ? error : new Error(`XPath ${xpath}の要素${attributeName}属性取得に失敗しました`)
      );
    }
  }

  /**
   * ページ上でJavaScriptを実行する
   * @param script 実行するスクリプト
   * @returns 実行結果
   */
  async evaluate<T>(script: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<Result<T>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      // ページ上でJavaScriptを実行
      const result = await this.page.evaluate(script, ...args);

      return success(result as T);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("JavaScriptの実行に失敗しました"));
    }
  }

  /**
   * セッションを終了する
   * @returns 終了結果
   */
  async close(): Promise<Result<void>> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("ブラウザの終了に失敗しました"));
    }
  }

  /**
   * XPath要素を取得する (.libs/pptr-utils.ts の移植)
   * @param xpath XPath式
   * @returns 要素の配列
   */
  private async $x(xpath: string): Promise<ElementHandle<Element>[]> {
    if (!this.page) throw new Error("ページが初期化されていません");
    const xpathToSelector = (xpath: string): string => `::-p-xpath(${xpath})`;
    return await this.page.$$(xpathToSelector(xpath));
  }

  /**
   * XPath要素が表示されるまで待機する (.libs/pptr-utils.ts の移植)
   * @param xpath XPath式
   * @param options 待機オプション
   * @returns 要素
   */
  async waitForXPath(xpath: string, options?: WaitForSelectorOptions): Promise<Result<ElementHandle<Element>>> {
    try {
      if (!this.page) {
        return failure(new Error("ページが初期化されていません"));
      }

      const xpathToSelector = (xpath: string): string => `::-p-xpath(${xpath})`;
      const element = await this.page.waitForSelector(xpathToSelector(xpath), options);

      if (!element) {
        return failure(new Error(`XPath ${xpath}に一致する要素が見つかりませんでした`));
      }

      return success(element);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`XPath ${xpath}の要素待機に失敗しました`));
    }
  }

  /**
   * 指定したミリ秒待機する
   * @param ms 待機するミリ秒
   * @returns 待機結果
   */
  async waitFor(ms: number): Promise<Result<void>> {
    try {
      await sleep(ms);
      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("待機処理に失敗しました"));
    }
  }

  /**
   * 要素のプロパティを取得する (.libs/pptr-utils.ts の移植)
   * @param element 要素ハンドル
   * @param propertyName プロパティ名
   * @returns プロパティ値
   */
  async getNodeProperty<T>(element: ElementHandle<Element>, propertyName: string): Promise<Result<T>> {
    try {
      const handle = await element.getProperty(propertyName);
      const value = (await handle.jsonValue()) as T;
      return success(value);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(`要素の${propertyName}プロパティ取得に失敗しました`));
    }
  }
}

/**
 * Puppeteerブラウザオプション
 */
export interface PuppeteerBrowserOptions {
  /**
   * ヘッドレスモード（true: UIなし、false: UIあり）
   */
  headless?: boolean | "new";

  /**
   * 動作の遅延（ms）
   */
  slowMo?: number;

  /**
   * ブラウザの種類
   */
  product?: "chrome" | "firefox";

  /**
   * その他のオプション
   */
  [key: string]: unknown;
}
