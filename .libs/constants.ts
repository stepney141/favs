export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

export const CHROME_ARGS = [
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-setuid-sandbox",
  "--no-first-run",
  "--no-zygote",
  //"--single-process", // NOTE: 有効にすると不具合が発生する場合あり https://github.com/puppeteer/puppeteer/issues/11515
  "--no-sandbox"
];
