// @ts-expect-error TS(2580): Cannot find name 'require'. Do you need to install... Remove this comment to see the full error message
const axios = require('axios');
// @ts-expect-error TS(2580): Cannot find name 'require'. Do you need to install... Remove this comment to see the full error message
const path = require('path');
// @ts-expect-error TS(2580): Cannot find name 'require'. Do you need to install... Remove this comment to see the full error message
const fs = require('fs/promises');
// @ts-expect-error TS(2580): Cannot find name 'require'. Do you need to install... Remove this comment to see the full error message
const papa = require("papaparse");
// @ts-expect-error TS(2580): Cannot find name 'require'. Do you need to install... Remove this comment to see the full error message
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// @ts-expect-error TS(2580): Cannot find name 'process'. Do you need to install... Remove this comment to see the full error message
const username = process.env.WIKIPEDIA_USERNAME;
// @ts-expect-error TS(2580): Cannot find name 'process'. Do you need to install... Remove this comment to see the full error message
const password = process.env.WIKIPEDIA_PASSWORD;

// @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
const sleep = async (seconds: any) => new Promise((resolve, reject) => { setTimeout(() => { resolve(); }, seconds * 1000); });

const handleAxiosError = (error: any) => {
  // ref: https://gist.github.com/fgilio/230ccd514e9381fafa51608fcf137253
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    console.log(error.request);
  } else {
    console.log('Error', error);
  }
};

/**
 * ログイントークンを取得する
 * ref: https://www.mediawiki.org/wiki/API:Tokens
 */
const getLoginToken = async (baseURI: any) => {
  try {
    const response = await axios({
      method: 'get',
      url: `https://${baseURI}/w/api.php`,
      params: new URLSearchParams({
        action: 'query',
        meta: 'tokens',
        type: 'login',
        format: 'json'
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const login_token = response.data?.query.tokens.logintoken;
    const cookies = response.headers?.['set-cookie'];

    return [login_token, cookies];
  } catch (e) {
    handleAxiosError(e);
    return false;
  }
};

/**
 * client loginを行う
 * ref: https://www.mediawiki.org/wiki/API:Login
 */
const postClientLogin = async (baseURI: any, login_token: any, cookies: any) => {
  try {
    const clientlogin_response = await axios({
      method: 'post',
      url: `https://${baseURI}/w/api.php`,
      data: new URLSearchParams({
        action: 'clientlogin',
        loginreturnurl: 'http://example.com/',
        logintoken: login_token,
        username: username,
        password: password,
        format: 'json'
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies
      }
    });
    const login_response_json = clientlogin_response.data?.clientlogin;
    const client_cookies = clientlogin_response.headers?.['set-cookie'];

    return [login_response_json, client_cookies];
  } catch (e) {
    handleAxiosError(e);
    return false;
  }
};

/**
 * ログイン処理を行う
 */
const login = async (baseURI: any, login_token: any, cookies: any) => {
  try {
    // @ts-expect-error TS(2488): Type 'false | any[]' must have a '[Symbol.iterator... Remove this comment to see the full error message
    const [login_response_json, client_cookies] = await postClientLogin(baseURI, login_token, cookies);
    const login_status = login_response_json?.status;
    console.log('status:', login_status);

    if (login_status === 'PASS') {
      console.log("Login Succeeded!");
      return [login_status, client_cookies];
    } else if (login_status === 'FAIL') {
      throw new Error("Login failed! Try again.");
    } else if (login_status === 'UI') {
      throw new Error(login_status);
    } else if (login_status === 'REDIRECT') {
      throw new Error(login_status);
    } else if (login_status === 'RESTART') {
      throw new Error("The authentication worked but a linked user account is not found.");
    } else {
      throw new Error("The login status is undefined");
    }
  } catch (e) {
    handleAxiosError(e);
    return false;
  }
};

/**
 * watchlistraw APIを叩き、レスポンスを返す
 * - https://www.mediawiki.org/wiki/Manual:Namespace
 * - https://www.mediawiki.org/wiki/API:Watchlistraw
 */
const getWatchlistRaw = async (baseURI: any, cookies: any, pagination = null) => {
  try {
    let queries = {
      action: 'query',
      format: 'json',
      list: 'watchlistraw',
      prop: 'info',
      wrlimit: 'max',
      wrnamespace: '0|2|4|6|8|10|12|14',
    };
    if (pagination !== null) {
      queries = {
        ...queries,
        // @ts-expect-error TS(2322): Type '{ wrcontinue: never; action: string; format:... Remove this comment to see the full error message
        wrcontinue: pagination
      };
    }

    const response = await axios({
      method: 'get',
      url: `https://${baseURI}/w/api.php`,
      params: queries,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies
      }
    });

    /** @type {Array<{ns: number, title: string}> | undefined} */
    const watchlist_data = response.data?.['watchlistraw'];

    /** @type {string} */
    const pagination_flag = response.data?.['continue']?.['wrcontinue'];

    return [watchlist_data, pagination_flag];
  } catch (e) {
    handleAxiosError(e);
    return false;
  }
};

/**
 * ページタイトルを与えると、そのページの固有IDを返す
 * - https://sleepygamersmemo.blogspot.com/2018/11/wikipedia-url-shortener-tool.html
 * - https://www.mediawiki.org/wiki/Extension:TextExtracts#API 
 */
const getPageId = async (baseURI: any, cookies: any, page_title: any) => {
  try {
    const response = await axios({
      method: 'post',
      url: `https://${baseURI}/w/api.php`,
      // @ts-expect-error TS(2345): Argument of type '{ action: string; prop: string; ... Remove this comment to see the full error message
      data: new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        exintro: false,
        explaintext: false,
        exchars: 1,
        titles: page_title,
        format: 'json'
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies
      }
    });
    const page_id = (Object.keys(response.data?.query.pages))[0]; // -1なら該当記事なしの意

    return page_id;
  } catch (e) {
    handleAxiosError(e);
    return false;
  }
};

const fetchWatchlist = async function* (baseURI: any, cookies: any) {
  /** @type {Array<{ns: number, title: string}> | undefined} */
  let wl_data;
  let pagination_flag = null;

  // ref: https://ja.javascript.info/async-iterators-generators
  while (pagination_flag !== undefined) {
    [wl_data, pagination_flag] = await getWatchlistRaw(baseURI, cookies, pagination_flag);

    for (const single_obj of wl_data) {
      const page_title = single_obj.title;
      const page_url = `https://${baseURI}/?curid=${await getPageId(baseURI, cookies, page_title)}`;

      yield [page_title, page_url];
    }

    // yield wl_data;
  }
};

/**
 * watchlistraw APIから得られた配列を取得し、指定したファイルに追記する
 */
const writeWatchlistToCSV = async (data: any, filename: any) => {
  try {
    await fs.appendFile(
      `./${filename}`,
      // papa.unparse(output_data),
      data,
      (e: any) => {
        if (e) console.log("error: ", e);
      }
    );
  } catch (e) {
    console.log(e);
  }
};

/**
 * APiを叩いてウォッチリストの情報を取得し、それをファイルに出力する
 */
const extractWatchlist = async (baseURI: any, cookies: any) => {
  try {
    const filename = `${baseURI}.csv`;
    const filehandle = await fs.open(filename, 'w');

    await writeWatchlistToCSV('title,url\n', filename); //CSVのヘッダ作成

    // ref: https://ja.javascript.info/async-iterators-generators
    // @ts-expect-error TS(2504): Type '{}' must have a '[Symbol.asyncIterator]()' m... Remove this comment to see the full error message
    for await (const [page_title, page_url] of fetchWatchlist(baseURI, cookies)) {
      const output_data = `${page_title},${page_url}\n`;
      await writeWatchlistToCSV(output_data, filename);
      // await sleep(1);
    }

    await filehandle.close();
  } catch (e) {
    handleAxiosError(e);
    return false;
  }
};

(async () => {
  const startTime = Date.now();
  console.log('Wikipedia Watchlists: Fetching started!');

  const accounts = {
    jawiki: 'ja.wikipedia.org',
    enwiki: 'en.wikipedia.org',
    wikicommons: 'commons.wikimedia.org'
  };

  // @ts-expect-error TS(2550): Property 'values' does not exist on type 'ObjectCo... Remove this comment to see the full error message
  for (const url of Object.values(accounts)) {
    console.log(`${url}: started`);
    const [login_token, login_cookies] = await getLoginToken(url);
    const [, client_cookies] = await login(url, login_token, login_cookies);

    await extractWatchlist(url, client_cookies);
    console.log(`${url}: finished`);
  }

  console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
})();
