import type { ElementHandle, JSHandle, NodeFor, Page } from "puppeteer";

export const getNodeProperty = async <T>(eh: ElementHandle<Node>, prop: string): Promise<T> => {
  const handle = (await eh.getProperty(prop)) as JSHandle<T>;
  const value = await handle.jsonValue();

  return value;
};

const xpathToUniversalSelector = (xpath: string): string => `::-p-xpath(${xpath})`;

export async function waitForXPath(page: Page, xpath: string) {
  return await page.waitForSelector(xpathToUniversalSelector(xpath));
}

export async function $x(page: Page, xpath: string) {
  return await page.$$(xpathToUniversalSelector(xpath));
}
