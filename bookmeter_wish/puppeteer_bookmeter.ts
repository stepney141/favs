import fs from "node:fs/promises";
import path from "path";

import axios, { isAxiosError } from "axios";
import { config } from "dotenv";
import { XMLParser } from "fast-xml-parser";
import { parse, unparse } from "papaparse";
import { PdfData } from "pdfdataextract";
import puppeteer from "puppeteer";

import { getNodeProperty, handleAxiosError, mapToArray, randomWait, sleep } from "../.libs/utils";

import {
  CSV_FILENAME,
  JOB_NAME,
  REGEX,
  XPATH,
  bookmeter_baseURI,
  bookmeter_userID,
  MATH_LIB_BOOKLIST,
  SOPHIA_LIB_CINII_ID,
  OPAC_URL
} from "./constants";

import type {
  Book,
  OpenBdResponse,
  CiniiResponse,
  NdlResponseJson,
  BIBLIOINFO_ERROR_STATUS,
  BookList,
  FetchBiblioInfo,
  BiblioInfoStatus,
  IsOwnBook,
  BookOwningStatus
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
const convertISBN10To13 = (isbn10: string): string => {
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

  // 1.の末尾に3.の値を添えて出来上がり
  return `${src}${checkdigit}`;
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
  #page_num: number;
  #bookList: BookList;

  constructor(browser: Browser) {
    this.#browser = browser;
    this.#page_num = 1;
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
      //ref: https://github.com/puppeteer/puppeteer/issues/8852
    ]);

    console.log(`${JOB_NAME}: Login Completed!`);
    return this;
  }

  async explore(): Promise<Map<string, Book>> {
    const page = await this.#browser.newPage();

    console.log(`${JOB_NAME}: Scraping Started!`);

    for (;;) {
      // 1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
      await sleep(randomWait(3000, 0.5, 1.1));

      await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/wish?page=${this.#page_num}`, {
        waitUntil: ["domcontentloaded", "networkidle0"]
      });

      const booksUrlHandle = await page.$x(XPATH.booksUrl);
      const amazonLinkHandle = await page.$x(XPATH.amazonLink);
      const isBookExistHandle = await page.$x(XPATH.isBookExist);

      for (let i = 0; i < booksUrlHandle.length; i++) {
        const bkmt_raw = await getNodeProperty(booksUrlHandle[i], "href");
        const bkmt = String(bkmt_raw); //本の情報のbookmeter内部リンクを取得

        const amzn_raw = await getNodeProperty(amazonLinkHandle[i], "href");
        const amzn = String((amzn_raw as string).match(REGEX.amazon_asin)); //Amazonへのリンクに含まれるISBN/ASINを抽出

        this.#bookList.set(bkmt, {
          //bookmeterの内部リンクをMapのキーにする
          bookmeter_url: bkmt,
          isbn_or_asin: amzn,
          book_title: "",
          author: "",
          publisher: "",
          published_date: "",
          exist_in_sophia: "No",
          central_opac_link: "",
          mathlib_opac_link: ""
        } satisfies Book);
      }

      console.log(`scanning page ${this.#page_num}`);

      // XPathで本の情報を取得し、そのelementHandleに要素が存在しなければループから抜ける
      if (isBookExistHandle.length == 0) {
        break;
      } else {
        this.#page_num++;
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
    prevList.set(obj["bookmeter_url"]!, { ...obj });
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

  if (isbn !== "null") {
    //正常系(与えるべきISBNがある)
    const response: AxiosResponse<OpenBdResponse> = await axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn}`);

    //正常系(該当書籍発見)
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

      //異常系(該当書籍なし)
    } else {
      const status_text: BIBLIOINFO_ERROR_STATUS = "Not_found_with_OpenBD";
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

    //異常系(与えるべきISBN自体がない)
  } else {
    const status_text: BIBLIOINFO_ERROR_STATUS = "Not_found_with_Amazon";
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
};

/**
 * 国立国会図書館 書誌検索
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */
const fetchNDL: FetchBiblioInfo = async (book: Book): Promise<BiblioInfoStatus> => {
  const isbn = book["isbn_or_asin"]; //ISBNデータを取得

  //正常系(与えるべきISBNがある)
  if (isbn !== "null") {
    const response: AxiosResponse = await axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn}`); //xml形式でレスポンスが返ってくる
    const json_resp: NdlResponseJson = fxp.parse(response.data); //xmlをjsonに変換
    const fetched_data = json_resp.rss.channel;

    //正常系(該当書籍発見)
    if ("item" in fetched_data) {
      /* 該当結果が単数か複数かによって、返却される値がObjectなのかArray<Object>なのか変わる
                    fast-xml-parserの設定をいじれば多分もっとスマートにできると思うが、とりあえず目的を達成するにはこれだけ判定すれば十分 */

      //該当件数が1件の場合
      if (!Array.isArray(fetched_data.item)) {
        const part = {
          book_title: fetched_data.item["title"] ?? "",
          author: fetched_data.item["author"] ?? "",
          publisher: fetched_data.item["dc:publisher"] ?? "",
          published_date: fetched_data.item["pubDate"] ?? ""
        };

        return {
          book: { ...book, ...part },
          isFound: true
        };

        //該当件数が2件以上の場合
      } else {
        //該当件数に関わらず、とりあえず配列の先頭にあるやつだけをチェックする
        const part = {
          book_title: fetched_data.item[0]["title"] ?? "",
          author: fetched_data.item[0]["author"] ?? "",
          publisher: fetched_data.item[0]["dc:publisher"] ?? "",
          published_date: fetched_data.item[0]["pubDate"] ?? ""
        };

        return {
          book: { ...book, ...part },
          isFound: true
        };
      }

      //異常系(該当書籍なし)
    } else {
      const status_text: BIBLIOINFO_ERROR_STATUS = "Not_found_with_NDL";
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

    //異常系(与えるべきISBNがない)
  } else {
    const status_text: BIBLIOINFO_ERROR_STATUS = "Not_found_with_Amazon";
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
const searchCiNii: IsOwnBook = async (book: Book): Promise<BookOwningStatus> => {
  const isbn = book["isbn_or_asin"]; //ISBNデータを取得

  //正常系(与えるべきISBNがある)
  if (isbn !== "null") {
    //中央図書館のチェック
    const response: AxiosResponse<CiniiResponse> = await axios.get(
      `https://ci.nii.ac.jp/books/opensearch/search?isbn=${isbn}&fano=${SOPHIA_LIB_CINII_ID}&format=json&appid=${cinii_appid}`
    );
    const total_results = response.data["@graph"][0]["opensearch:totalResults"];

    //検索結果が1件以上
    if (total_results !== "0") {
      const ncid_url = response.data["@graph"][0].items![0]["@id"];
      const ncid = ncid_url.match(REGEX.ncid_in_cinii_url)?.[0]; //ciniiのURLからncidだけを抽出

      return {
        book: {
          ...book,
          exist_in_sophia: "Yes",
          central_opac_link: `${OPAC_URL.sophia}/opac/opac_openurl?ncid=${ncid}` //opacのリンク
        },
        isOwning: true
      };

      //検索結果が0件
    } else {
      return {
        book: {
          ...book,
          exist_in_sophia: "No"
        },
        isOwning: false
      };
    }

    //異常系(与えるべきISBN自体がない)
  } else {
    return {
      book: {
        ...book,
        exist_in_sophia: "No"
        // exist_in_sophia: this.wishBooksData.get(key)!["book_title"] //とりあえず"book_title"の中にエラーメッセージ入っとるやろ！の精神
      },
      isOwning: false
    };
  }
};

/**
 * 数学図書館の所蔵検索
 */
const searchSophiaMathLib: IsOwnBook = (book: Book, additionalInfo?: Set<string>): BookOwningStatus => {
  const isbn: string = book.isbn_or_asin!;
  const mathlib_isbn_list = additionalInfo!;

  if (mathlib_isbn_list.has(isbn) || mathlib_isbn_list.has(convertISBN10To13(isbn))) {
    const mathlib_opac_link = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;
    return {
      book: {
        ...book,
        exist_in_sophia: "Yes",
        mathlib_opac_link: mathlib_opac_link
      },
      isOwning: true
    };
  } else {
    return {
      book,
      isOwning: false
    };
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

const fetchBiblioInfo = async (booklist: BookList): Promise<void> => {
  const mathLibIsbnList = await configMathlibBookList("ja");

  for (const bookmeter of booklist.values()) {
    let updatedBook = await fetchOpenBD(bookmeter);
    if (updatedBook.isFound === false) {
      updatedBook = await fetchNDL(updatedBook.book);
    }

    updatedBook.book = (await searchCiNii(updatedBook.book)).book;
    updatedBook.book = (await searchSophiaMathLib(updatedBook.book, mathLibIsbnList)).book;

    booklist.set(updatedBook.book.bookmeter_url, updatedBook.book);

    await sleep(randomWait(2000, 0.8, 1.1));
  }

  console.log(`${JOB_NAME}: Searching Completed`);
};

(async () => {
  try {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: "new",
      slowMo: 30
    });

    const book = new Bookmaker(browser);
    const latestBookList = await book.login().then((book) => book.explore());
    const prevBookList = await getPrevBookList(CSV_FILENAME);

    if (isBookListDifferent(latestBookList, prevBookList)) {
      console.log(`${JOB_NAME}: Fetching bibliographic information`);
      await fetchBiblioInfo(latestBookList); //書誌情報取得
      const arrayBookList: Book[] = mapToArray(latestBookList);
      await writeCSV(arrayBookList, CSV_FILENAME); //ファイル出力
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
