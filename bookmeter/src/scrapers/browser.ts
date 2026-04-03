/**
 * Puppeteer の起動設定を一箇所に集約する。
 * ブラウザのライフサイクル管理は呼び出し側が担う。
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { CHROME_ARGS } from "../../../.libs/constants";

import type { Browser } from "puppeteer";

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("navigator.plugins");
stealthPlugin.enabledEvasions.delete("media.codecs");
puppeteer.use(stealthPlugin);

export async function launchBookmeterBrowser(): Promise<Browser> {
  return puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    args: CHROME_ARGS,
    slowMo: 15
  });
}
