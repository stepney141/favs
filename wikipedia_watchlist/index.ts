import fs from "fs/promises";
import path from "path";

import axios, { isAxiosError } from "axios";
import { config } from "dotenv";

import { Err, Ok, unwrapResult } from "../.libs/lib";
import { handleAxiosError } from "../.libs/utils";

import { ACCOUNTS, JOB_NAME } from "./constants";

import type {
  ApiTokenResponse,
  ClientLoginResponse,
  LoginStatus,
  Pagination,
  TargetUrls,
  TextExtractsResponse,
  WatchlistrawResponse,
  Watchlists
} from "./types";
import type { Result } from "../.libs/lib";
import type { AxiosResponse } from "axios";

config({ path: path.join(__dirname, "../.env") });
const username = process.env.WIKIPEDIA_USERNAME!;
const password = process.env.WIKIPEDIA_PASSWORD!;

/**
 * ログイントークンを取得する
 * @link https://www.mediawiki.org/wiki/API:Tokens
 */
const getLoginToken = async (baseURI: TargetUrls): Promise<[string, string[]]> => {
  // ref: https://interrupt.co.jp/blog/entry/2021/04/17/073733
  const response: Result<AxiosResponse<ApiTokenResponse>> = await axios({
    method: "get",
    url: `https://${baseURI}/w/api.php`,
    params: new URLSearchParams({
      action: "query",
      meta: "tokens",
      type: "login",
      format: "json"
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  })
    .then((res) => Ok(res))
    .catch((e) => Err(e));

  const login_token = unwrapResult(response).data?.query.tokens.logintoken;
  const cookies = unwrapResult(response).headers["set-cookie"]!;

  return [login_token, cookies];
};

/**
 * client loginを行う
 * @link https://www.mediawiki.org/wiki/API:Login#Method_2._clientlogin
 */
const postClientLogin = async (
  baseURI: TargetUrls,
  login_token: string,
  cookies: string[]
): Promise<[ClientLoginResponse["clientlogin"], string[]]> => {
  const response: Result<AxiosResponse<ClientLoginResponse>> = await axios({
    method: "post",
    url: `https://${baseURI}/w/api.php`,
    data: new URLSearchParams({
      action: "clientlogin",
      loginreturnurl: "http://example.com/",
      logintoken: login_token,
      username: username,
      password: password,
      format: "json"
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies
    }
  })
    .then((res) => Ok(res))
    .catch((e) => Err(e));

  const login_response_json = unwrapResult(response).data?.clientlogin;
  const client_cookies: string[] = unwrapResult(response).headers["set-cookie"]!;

  return [login_response_json, client_cookies];
};

/**
 * ログイン処理を行う
 */
const login = async (baseURI: TargetUrls, login_token: string, cookies: string[]): Promise<[LoginStatus, string[]]> => {
  const [login_response_json, client_cookies] = await postClientLogin(baseURI, login_token, cookies);
  const login_status = login_response_json?.status;
  console.log("status:", login_status);

  if (login_status === "PASS") {
    console.log("Login Succeeded!");
    return [login_status, client_cookies];
  } else if (login_status === "FAIL") {
    throw new Error("Login failed! Try again.");
  } else if (login_status === "UI") {
    throw new Error(login_status);
  } else if (login_status === "REDIRECT") {
    throw new Error(login_status);
  } else if (login_status === "RESTART") {
    throw new Error("The authentication worked but a linked user account is not found.");
  } else {
    throw new Error("The login status is undefined");
  }
};

/**
 * ページタイトルを与えると、そのページの固有IDを返す
 * - https://sleepygamersmemo.blogspot.com/2018/11/wikipedia-url-shortener-tool.html
 * - https://www.mediawiki.org/wiki/Extension:TextExtracts#API
 */
const getPageId = async (baseURI: TargetUrls, cookies: string[], page_title: string): Promise<string | -1> => {
  const response: Result<AxiosResponse<TextExtractsResponse>> = await axios({
    method: "post",
    url: `https://${baseURI}/w/api.php`,
    data: new URLSearchParams({
      action: "query",
      prop: "extracts",
      exintro: `${false}`,
      explaintext: `${false}`,
      exchars: `${1}`,
      titles: page_title,
      format: "json"
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies
    }
  })
    .then((res) => Ok(res))
    .catch((e) => Err(e));

  const page_id = Object.keys(unwrapResult(response).data?.query.pages)[0]; // -1なら該当記事なしの意
  return page_id;
};

/**
 * watchlistraw APIを叩き、レスポンスを返す
 * @link https://www.mediawiki.org/wiki/Manual:Namespace
 * @link https://www.mediawiki.org/wiki/API:Watchlistraw
 */
const getWatchlistRaw = async (
  baseURI: TargetUrls,
  cookies: string[],
  pagination: Pagination
): Promise<[Watchlists, Pagination]> => {
  const queries = {
    action: "query",
    format: "json",
    list: "watchlistraw",
    prop: "info",
    wrlimit: "max",
    wrnamespace: "0|2|4|6|8|10|12|14",
    wrcontinue: pagination
    // 初回アクセスではwrcontinueを指定してはいけないので、undefinedを無視してくれないURLSearchParamsは使わない
    // (axiosはundefined値のプロパティを無視してくれる)
  };
  const response: Result<AxiosResponse<WatchlistrawResponse>> = await axios({
    method: "get",
    url: `https://${baseURI}/w/api.php`,
    params: queries,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies
    }
  })
    .then((res) => Ok(res))
    .catch((e) => Err(e));

  const watchlist_data: Watchlists = unwrapResult(response).data?.["watchlistraw"];
  const pagination_flag: Pagination = unwrapResult(response).data?.["continue"]?.["wrcontinue"];

  return [watchlist_data, pagination_flag];
};

const fetchWatchlist = async function* (baseURI: TargetUrls, cookies: string[]): AsyncGenerator<[string, string]> {
  let wl_data: Watchlists, pagination: Pagination;

  // ref: https://ja.javascript.info/async-iterators-generators
  do {
    [wl_data, pagination] = await getWatchlistRaw(baseURI, cookies, pagination);

    for (const article of wl_data) {
      const page_title = article.title;
      const page_id = await getPageId(baseURI, cookies, page_title);
      const page_url = `https://${baseURI}/?curid=${page_id}`;

      yield [page_title, page_url];
    }
  } while (pagination !== undefined);
};

/**
 * APiを叩いてウォッチリストの情報を取得し、それをファイルに出力する
 */
const extractWatchlist = async (baseURI: TargetUrls, cookies: string[]): Promise<void> => {
  const filename = `${baseURI}.csv`;
  const filehandle = await fs.open(filename, "w");

  await fs.appendFile(`./${filename}`, "title,url\n"); //CSVのヘッダ作成

  // ref: https://ja.javascript.info/async-iterators-generators
  for await (const [page_title, page_url] of fetchWatchlist(baseURI, cookies)) {
    const output_data = `${page_title},${page_url}\n`;
    await fs.appendFile(`./${filename}`, output_data);
  }

  await filehandle.close();
};

(async () => {
  try {
    const startTime = Date.now();
    console.log(`${JOB_NAME}: Fetching started!`);

    for (const url of Object.values(ACCOUNTS)) {
      console.log(`${url}: started`);
      const [login_token, login_cookies] = await getLoginToken(url);
      const [, client_cookies] = await login(url, login_token, login_cookies);

      await extractWatchlist(url, client_cookies);
      console.log(`${url}: finished`);
    }

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    if (isAxiosError(e)) {
      handleAxiosError(e);
    } else {
      console.log(e);
    }
  }
})();
