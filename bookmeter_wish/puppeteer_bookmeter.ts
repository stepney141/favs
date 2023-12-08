import fs from "node:fs/promises";
import path from "path";

import axios, { isAxiosError } from "axios";
import { config } from "dotenv";
import { XMLParser } from "fast-xml-parser";
import { parse, unparse } from "papaparse";
import { PdfData } from "pdfdataextract";
import { launch } from "puppeteer";

import { getNodeProperty, handleAxiosError, mapToArray, randomWait, sleep } from "../.libs/utils";

import {
  CSV_FILENAME,
  JOB_NAME,
  REGEX,
  XPATH,
  bookmeter_baseURI,
  bookmeter_userID,
  MATH_LIB_BOOKLIST,
  CINII_TARGETS
} from "./constants";
import {
  isAsin,
  type ASIN,
  type Book,
  type OpenBdResponse,
  type CiniiResponse,
  type NdlResponseJson,
  type BiblioinfoErrorStatus,
  type BookList,
  type FetchBiblioInfo,
  type BiblioInfoStatus,
  type IsOwnBook,
  type BookOwningStatus,
  type GoogleBookApiResponse,
  type IsOwnBookConfig,
  type ISBN10,
  type ISBN13,
} from "./types";

import type { AxiosResponse } from "axios";
import type { ParseResult } from "papaparse";
import type { Browser, ElementHandle } from "puppeteer";

config({ path: path.join(__dirname, "../.env") });
const bookmeter_username = process.env.BOOKMETER_ACCOUNT!.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD!.toString();
const cinii_appid = process.env.CINII_API_APPID!.toString();

/**
 * @link https://qiita.com/iz-j/items/27b9656ebed1a4516ee1
 */
const convertISBN10To13 = (isbn10: ISBN10): ISBN13 => {
  // 1. 先頭に`978`を足して、末尾の1桁を除く
  const src = `978${isbn10.slice(0, 9)}`;

  // 2. 先頭の桁から順に1、3、1、3…を掛けて合計する
  const sum = src
    .split("")
    .map((s) => parseInt(s))
    .reduce((p, c, i) => p + (i % 2 === 0 ? c : c * 3));

  // 3. 合計を10で割った余りを10から引く（※引き算の結果が10の時は0とする）
  const rem = 10 - (sum % 10);
  const checkdigit = rem === 10 ? 0 : rem;

  const result = `${src}${checkdigit}`;

  // 1.の末尾に3.の値を添えて出来上がり
  return result as ISBN13;
};

/**
 * Amazonへのリンクに含まれるASIN(ISBN含む)を抽出
 */
const matchASIN = (url: string): string | null => {
  const matched = url.match(REGEX.amazon_asin);
  return matched?.[0] ?? null;
};

const writeCSV = async (array_data: Book[], filename: string) => {
  const json_data = JSON.stringify(array_data, null, "  ");
  const csv_data = unparse(json_data);

  const filehandle = await fs.open(filename, "w");
  await fs.appendFile(`./${filename}`, csv_data);
  await filehandle.close();
  console.log(`${JOB_NAME}: CSV Output Completed!`);
};

const readCSV = async (filename: string) => {
  const data = await fs.readFile(filename, "utf-8");
  const parsed_obj = parse(data, {
    header: true,
    complete: (results: ParseResult<Book>) => results
  });
  return parsed_obj.data;
};

const fxp = new XMLParser();

class Bookmaker {
  #browser: Browser;
  #bookList: BookList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#bookList = new Map();
  }

  /**
   * Amazon詳細リンクはアカウントにログインしなければ表示されないため、ログインする
   */
  async login() {
    const page = await this.#browser.newPage();

    await page.goto(`${bookmeter_baseURI}/login`, {
      waitUntil: "networkidle2"
    });

    const accountNameInputHandle = await page.$x(XPATH.accountNameInput);
    const passwordInputHandle = await page.$x(XPATH.passwordInput);
    const loginButtonHandle = await page.$x(XPATH.loginButton);

    await accountNameInputHandle[0].type(bookmeter_username);
    await passwordInputHandle[0].type(bookmeter_password);

    await Promise.all([
      page.waitForNavigation({
        timeout: 2 * 60 * 1000,
        waitUntil: ["networkidle0", "domcontentloaded"]
      }),
      (loginButtonHandle[0] as ElementHandle<Element>).click()
      // ref: https://github.com/puppeteer/puppeteer/issues/8852
    ]);

    console.log(`${JOB_NAME}: Login Completed!`);
    return this;
  }

  async explore(): Promise<Map<string, Book>> {
    const page = await this.#browser.newPage();
    let page_num = 1;

    console.log(`${JOB_NAME}: Scraping Started!`);

    for (;;) {
      // 1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
      await sleep(randomWait(2000, 0.5, 1.1));

      await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/wish?page=${page_num}`, {
        waitUntil: ["domcontentloaded", "networkidle0"]
      });

      const booksUrlHandle = await page.$x(XPATH.booksUrl);
      const amazonLinkHandle = await page.$x(XPATH.amazonLink);
      const isBookExistHandle = await page.$x(XPATH.isBookExist);

      for (let i = 0; i < booksUrlHandle.length; i++) {
        const bkmt_raw = await getNodeProperty(booksUrlHandle[i], "href");
        const bkmt = String(bkmt_raw); //本の情報のbookmeter内部リンクを取得

        const amzn_raw: string = await getNodeProperty(amazonLinkHandle[i], "href");
        const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN | null;

        this.#bookList.set(bkmt, {
          //bookmeterの内部リンクをMapのキーにする
          bookmeter_url: bkmt,
          isbn_or_asin: amzn,
          book_title: "",
          author: "",
          publisher: "",
          published_date: "",
          exist_in_Sophia: "No",
          exist_in_UTokyo: "No",
          central_opac_link: "",
          mathlib_opac_link: ""
        });
      }

      console.log(`scanning page ${page_num}`);

      // XPathで本の情報を取得し、そのelementHandleに要素が存在しなければループから抜ける
      if (isBookExistHandle.length == 0) {
        break;
      } else {
        page_num++;
      }
    }
    console.log(`${JOB_NAME}: Bookmeter Scraping Completed!`);

    return this.#bookList;
  }
}

/**
 * 前回の書籍リストをCSVから読み出し、Mapにデシリアライズする
 */
const getPrevBookList = async (filename: string): Promise<BookList> => {
  const csv = await readCSV(filename);
  const prevList: BookList = new Map();
  for (const obj of csv) {
    prevList.set(obj["bookmeter_url"], { ...obj });
  }
  return prevList;
};

/**
 * ローカルのCSVとbookmeterのスクレイピング結果を比較する
 * 差分を検出したら、書誌情報を取得してCSVを新規生成する
 */
const isBookListDifferent = (latestList: BookList, prevList: BookList): boolean => {
  for (const key of latestList.keys()) {
    if (prevList.has(key) === false) {
      //ローカルのCSVとbookmeterのスクレイピング結果を比較
      console.log(`${JOB_NAME}: Detected some diffs between the local and remote.`); //差分を検出した場合
      return true;
    }
  }

  //差分を検出しなかった場合
  console.log(`${JOB_NAME}: Cannot find any differences between the local and remote. The process will be aborted...`);
  return false;
};

/**
 * OpenBD検索
 */
const fetchOpenBD = async (book: Book): Promise<BiblioInfoStatus> => {
  const isbn = book["isbn_or_asin"]; //ISBNデータを取得

  if (isbn === null || isbn === undefined) {
    //有効なISBNではない
    const status_text: BiblioinfoErrorStatus = "INVALID_ISBN";
    const part = {
      book_title: status_text,
      author: status_text,
      publisher: status_text,
      published_date: status_text
    };
    return {
      book: { ...book, ...part },
      isFound: true
    };
  }

  const response: AxiosResponse<OpenBdResponse> = await axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn}`);

  //本の情報があった
  if (response.data[0] !== null) {
    const fetched_data = response.data[0].summary;
    const part = {
      book_title: fetched_data.title ?? "",
      author: fetched_data.author ?? "",
      publisher: fetched_data.publisher ?? "",
      published_date: fetched_data.pubdate ?? ""
    };

    return {
      book: { ...book, ...part },
      isFound: true
    };

    //本の情報がなかった
  } else {
    const status_text: BiblioinfoErrorStatus = "Not_found_in_OpenBD";
    const part = {
      book_title: status_text,
      author: status_text,
      publisher: status_text,
      published_date: status_text
    };

    return {
      book: { ...book, ...part },
      isFound: false
    };
  }
};

/**
 * 国立国会図書館 書誌検索
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */
const fetchNDL: FetchBiblioInfo = async (book: Book): Promise<BiblioInfoStatus> => {
  const isbn = book["isbn_or_asin"]; //ISBNデータを取得

  if (isbn === null || isbn === undefined) {
    //有効なISBNではない
    const status_text: BiblioinfoErrorStatus = "INVALID_ISBN";
    const part = {
      book_title: status_text,
      author: status_text,
      publisher: status_text,
      published_date: status_text
    };
    return {
      book: { ...book, ...part },
      isFound: false
    };
  }

  const response: AxiosResponse<string> = await axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn}`); //xml形式でレスポンスが返ってくる
  const json_resp = fxp.parse(response.data) as NdlResponseJson; //xmlをjsonに変換
  const fetched_data = json_resp.rss.channel;

  //本の情報があった
  if ("item" in fetched_data) {
    // 該当結果が単数か複数かによって、返却される値がObjectなのかArray<Object>なのか変わる。
    // fast-xml-parserの設定をいじれば多分もっとスマートにできると思うが、とりあえず目的を達成するにはこれだけ判定すれば十分。
    // 面倒なので、該当件数に関わらず配列の先頭だけをチェックしておく
    const bookinfo = Array.isArray(fetched_data.item) ? fetched_data.item[0] : fetched_data.item;
    const part = {
      book_title: bookinfo["title"] ?? "",
      author: bookinfo["author"] ?? "",
      publisher: bookinfo["dc:publisher"] ?? "",
      published_date: bookinfo["pubDate"] ?? ""
    };
    return {
      book: { ...book, ...part },
      isFound: true
    };

    //本の情報がなかった
  } else {
    const status_text: BiblioinfoErrorStatus = "Not_found_in_NDL";
    const part = {
      book_title: status_text,
      author: status_text,
      publisher: status_text,
      published_date: status_text
    };
    return {
      book: { ...book, ...part },
      isFound: false
    };
  }
};

/**
 * 洋書の検索
 * @link https://developers.google.com/books/docs/v1/reference/volumes/list?hl=en
 */
const fetchGoogleBooks: FetchBiblioInfo = async (book: Book): Promise<BiblioInfoStatus> => {
  const isbn = book["isbn_or_asin"];

  if (isbn === null || isbn === undefined) {
    //有効なISBNではない
    const status_text: BiblioinfoErrorStatus = "INVALID_ISBN";
    const part = {
      book_title: status_text,
      author: status_text,
      publisher: status_text,
      published_date: status_text
    };
    return {
      book: { ...book, ...part },
      isFound: false
    };
  }

  //有効なISBNがある
  const response: AxiosResponse<GoogleBookApiResponse> = await axios.get(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
  );
  const json = response.data;

  if (json.totalItems !== 0 && json.items !== undefined) {
    //本の情報があった
    const bookinfo = json.items[0].volumeInfo;
    const part = {
      book_title: `${bookinfo.title}${bookinfo.subtitle === undefined ? "" : " " + bookinfo.subtitle}`,
      author: bookinfo.authors?.toString() ?? "",
      publisher: bookinfo.publisher ?? "",
      published_date: bookinfo.publishedDate ?? ""
    };
    return {
      book: { ...book, ...part },
      isFound: true
    };
  } else {
    //本の情報がなかった
    const status_text: BiblioinfoErrorStatus = "Not_found_in_GoogleBooks";
    const part = {
      book_title: status_text,
      author: status_text,
      publisher: status_text,
      published_date: status_text
    };
    return {
      book: { ...book, ...part },
      isFound: false
    };
  }
};

/**
 * 大学図書館 所蔵検索(CiNii)
 * @link https://support.nii.ac.jp/ja/cib/api/b_opensearch
 */
const searchCiNii: IsOwnBook<null> = async (config: IsOwnBookConfig<null>): Promise<BookOwningStatus> => {
  const isbn = config.book["isbn_or_asin"]; //ISBNデータを取得
  const library = config.options?.libraryInfo;

  if (library === undefined) {
    throw new Error("The library info is undefined");
  }

  if (isbn === null || isbn === undefined) {
    //異常系(与えるべきISBN自体がない)
    return {
      book: { ...config.book, [`exist_in_${library.tag}`]: "No" },
      isOwning: false
    };
  }

  //中央図書館のチェック
  const response: AxiosResponse<CiniiResponse> = await axios.get(
    `https://ci.nii.ac.jp/books/opensearch/search?isbn=${isbn}&kid=${library?.cinii_kid}&format=json&appid=${cinii_appid}`
  );
  const json = response.data["@graph"][0];
  const bookinfo = json.items;
  if (bookinfo === undefined) {
    return {
      book: { ...config.book, [`exist_in_${library.tag}`]: "No" },
      isOwning: false
    };
  }

  const total_results = json["opensearch:totalResults"];
  if (total_results !== "0") {
    //検索結果が1件以上
    const ncid_url = bookinfo[0]["@id"];
    const ncid = ncid_url.match(REGEX.ncid_in_cinii_url)?.[0]; //ciniiのURLからncidだけを抽出
    return {
      book: {
        ...config.book,
        [`exist_in_${library.tag}`]: "Yes",
        central_opac_link: `${library?.opac}/opac/opac_openurl?ncid=${ncid}` //opacのリンク
      },
      isOwning: true
    };
  } else {
    //検索結果が0件
    return {
      book: { ...config.book, [`exist_in_${library.tag}`]: "No" },
      isOwning: false
    };
  }
};

/**
 * 数学図書館の所蔵検索
 */
const searchSophiaMathLib: IsOwnBook<Set<string>> = (config: IsOwnBookConfig<Set<string>>): BookOwningStatus => {
  const book_id = config.book.isbn_or_asin;
  const mathlib_isbn_list = config.options?.resources;

  if (mathlib_isbn_list === undefined) {
    throw new Error("the mathlib booklist is undefined");
  }

  if (book_id === null || book_id === undefined || isAsin(book_id)) {
    return { book: { ...config.book }, isOwning: false };
  }

  const isbn13 = convertISBN10To13(book_id);

  if (mathlib_isbn_list.has(isbn13) || mathlib_isbn_list.has(isbn13)) {
    const mathlib_opac_link = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn13}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;
    return {
      book: {
        ...config.book,
        exist_in_Sophia: "Yes",
        mathlib_opac_link: mathlib_opac_link
      },
      isOwning: true
    };
  } else {
    return { book: { ...config.book }, isOwning: false };
  }
};

const configMathlibBookList = async (listtype: keyof typeof MATH_LIB_BOOKLIST): Promise<Set<string>> => {
  const target_pdf_url = MATH_LIB_BOOKLIST[listtype];
  const mathlib_isbn_list: Set<string> = new Set();

  const response: AxiosResponse<Uint8Array> = await axios.get(target_pdf_url, {
    responseType: "arraybuffer",
    headers: {
      "Content-Type": "application/pdf"
    }
  });

  const pdf_data: Uint8Array = response["data"];
  const pdf_parsed = await PdfData.extract(pdf_data, { sort: false });

  console.log(`${JOB_NAME}: Completed fetching the list of ${listtype} books in Sophia Univ. Math Lib`);

  const filename = `mathlib_${listtype}.text`;
  const filehandle = await fs.open(filename, "w");

  for (const page of pdf_parsed.text!) {
    const matched_all = page.matchAll(REGEX.isbn);
    for (const match of matched_all) {
      mathlib_isbn_list.add(match[0]);
      await fs.appendFile(`./${filename}`, `${match[0]}\n`);
    }
  }

  await filehandle.close();

  console.log(`${JOB_NAME}: Completed creating a list of ISBNs of ${listtype} books in Sophia Univ. Math Lib`);
  return mathlib_isbn_list;
};

const fetchBiblioInfo = async (booklist: BookList): Promise<BookList> => {
  const mathLibIsbnList = await configMathlibBookList("ja");

  for (const bookmeter of booklist.values()) {
    let updatedBook = await fetchOpenBD(bookmeter);
    if (!updatedBook.isFound) {
      updatedBook = await fetchNDL(updatedBook.book);
    }
    if (!updatedBook.isFound) {
      updatedBook = await fetchGoogleBooks(updatedBook.book);
    }

    for (const library of CINII_TARGETS) {
      const ciniiStatus = await searchCiNii({ book: updatedBook.book, options: { libraryInfo: library } });
      if (ciniiStatus.isOwning) {
        updatedBook.book = ciniiStatus.book;
      }
    }

    const smlStatus = searchSophiaMathLib({
      book: updatedBook.book,
      options: { resources: mathLibIsbnList }
    });
    if (smlStatus.isOwning) {
      updatedBook.book = smlStatus.book;
    }

    booklist.set(updatedBook.book.bookmeter_url, updatedBook.book);

    await sleep(randomWait(1100, 0.8, 1.1));
  }

  console.log(`${JOB_NAME}: Searching Completed`);
  return new Map(booklist);
};

(async () => {
  try {
    const startTime = Date.now();

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: "new",
      slowMo: 30
    });

    const book = new Bookmaker(browser);
    const latestBookList = await book.login().then((book) => book.explore());
    const prevBookList = await getPrevBookList(CSV_FILENAME);

    if (isBookListDifferent(latestBookList, prevBookList)) {
      console.log(`${JOB_NAME}: Fetching bibliographic information`);
      const updatedBooklist = await fetchBiblioInfo(latestBookList); //書誌情報取得
      await writeCSV(mapToArray(updatedBooklist), CSV_FILENAME); //ファイル出力
    }

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    if (isAxiosError(e)) {
      handleAxiosError(e);
    } else {
      console.log(e);
    }
  }
})();
