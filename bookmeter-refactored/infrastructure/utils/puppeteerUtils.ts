import type { Browser, ElementHandle, Page } from "puppeteer";

/**
 * Puppeteerの便利なユーティリティ関数群
 */

/**
 * XPathに基づいて要素を取得する（puppeteerの標準APIを使用）
 * @param page Puppeteerページオブジェクト
 * @param xpath XPath文字列
 * @returns 要素ハンドルの配列
 */
export async function $x(page: Page, xpath: string): Promise<ElementHandle[]> {
  return await page.$$eval(xpath, (elements) => elements);
}

/**
 * XPathで指定した要素が表示されるまで待機する（puppeteerの標準APIを使用）
 * @param page Puppeteerページオブジェクト
 * @param xpath XPath文字列
 * @param options 待機オプション
 * @returns 要素ハンドル
 */
export async function waitForXPath(
  page: Page,
  xpath: string,
  options: { timeout?: number } = {}
): Promise<ElementHandle | null> {
  return await page.waitForSelector(xpath, {
    ...options,
    visible: true
  });
}

/**
 * 要素のプロパティを取得する
 * @param element 要素ハンドル
 * @param propertyName プロパティ名
 * @returns プロパティ値
 */
export async function getNodeProperty(element: ElementHandle, propertyName: string): Promise<string> {
  const property = await element.getProperty(propertyName);
  return (await property.jsonValue()) as string;
}

/**
 * 画像読み込みをブロックする設定を行う
 * @param page Puppeteerページオブジェクト
 */
export async function setupImageBlocker(page: Page): Promise<void> {
  await page.setRequestInterception(true);

  page.on("request", (request) => {
    if (
      request.resourceType() === "image" ||
      request.url().endsWith(".png") ||
      request.url().endsWith(".jpg") ||
      request.url().endsWith(".jpeg") ||
      request.url().endsWith(".gif")
    ) {
      void request.abort();
    } else {
      void request.continue();
    }
  });
}

/**
 * ブラウザを初期化する
 * @param options ブラウザ起動オプション
 * @returns Puppeteerブラウザインスタンス
 */
export async function initializeBrowser(
  options: {
    width?: number;
    height?: number;
    headless?: boolean | "new";
    slowMo?: number;
    args?: string[];
  } = {}
): Promise<Browser> {
  const { width = 1000, height = 1000, headless = true, slowMo = 0, args = [] } = options;

  // Chrome起動引数の標準セット
  const defaultArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
    "--lang=ja-JP,ja"
  ];

  // puppeteerをインポート
  const puppeteer = await import("puppeteer");

  return await puppeteer.launch({
    defaultViewport: { width, height },
    headless,
    args: [...defaultArgs, ...args],
    slowMo
  });
}
