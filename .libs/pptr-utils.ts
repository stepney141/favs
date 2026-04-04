import type { ElementHandle, JSHandle, Page, WaitForSelectorOptions } from "puppeteer";

export const getNodeProperty = async <T = string>(eh: ElementHandle<Node>, prop: string): Promise<T> => {
  const handle = (await eh.getProperty(prop)) as JSHandle<T>;
  const value = await handle.jsonValue();

  return value;
};

const xpathToUniversalSelector = (xpath: string): string => `::-p-xpath(${xpath})`;

export async function waitForXPath(
  page: Page,
  xpath: string,
  options?: WaitForSelectorOptions
): Promise<ElementHandle<Element> | null> {
  return page.waitForSelector(xpathToUniversalSelector(xpath), options);
}

export async function $x(page: Page, xpath: string): Promise<ElementHandle<Element>[]> {
  return await page.$$(xpathToUniversalSelector(xpath));
}

/**
 * lazy loading workaround
 * https://www.mrskiro.dev/posts/playwright-for-lazy-loading
 */
export const scrollToBottom = async (page: Page): Promise<void> => {
  type WindowWithNameHack = Window & {
    __name?: <T extends (...args: never[]) => unknown>(func: T) => T;
  };
  console.log(`Scrolling to bottom...`);
  await page.evaluate(async () => {
    // ugly hack to avoid esbuild bug...
    // ref: https://github.com/evanw/esbuild/issues/2605
    const browserWindow = window as WindowWithNameHack;
    browserWindow.__name = <T extends (...args: never[]) => unknown>(func: T): T => func;

    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    // scroll to bottom
    for (let i = 0; i < document.body.scrollHeight; i += 100) {
      window.scrollTo(0, i);
      await delay(500);
    }
    await delay(3000);
    // scroll to top
    for (let i = document.body.scrollHeight; i > 0; i -= 100) {
      window.scrollTo(0, i);
      await delay(500);
    }
    await delay(3000);
  });
};
