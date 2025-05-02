import type { ElementHandle, JSHandle, Page, WaitForSelectorOptions } from "puppeteer";

export const getNodeProperty = async <T>(eh: ElementHandle<Node>, prop: string): Promise<T> => {
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
