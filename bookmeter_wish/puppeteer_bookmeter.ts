import fs from "node:fs/promises";
import path from "path";

import axios from "axios";
import { config } from "dotenv";
import { XMLParser } from "fast-xml-parser";
import fetch from "node-fetch";
import { parse } from "papaparse";
import { PdfData } from "pdfdataextract";
import { launch } from "puppeteer";

import { PromiseQueue, getNodeProperty, mapToArray, randomWait, sleep, exportFile, zip } from "../.libs/utils";

import {
  CSV_FILENAME,
  JOB_NAME,
  REGEX,
  XPATH,
  bookmeter_baseURI,
  bookmeter_userID,
  MATH_LIB_BOOKLIST,
  CINII_TARGETS,
  CINII_TARGET_TAGS
} from "./constants";
import {
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
  isIsbn10
} from "./types";

import type { AxiosResponse } from "axios";
import type { ParseResult } from "papaparse";
import type { Browser, ElementHandle } from "puppeteer";

config({ path: path.join(__dirname, "../.env") });
const bookmeter_username = process.env.BOOKMETER_ACCOUNT!.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD!.toString();
const cinii_appid = process.env.CINII_API_APPID!.toString();
const google_books_api_key = process.env.GOOGLE_BOOKS_API_KEY!.toString();

/**
 * @example 
 input: https://www.lib.sophia.ac.jp/opac/opac_openurl/?isbn=1000000000 //invalid
 => https://www.lib.sophia.ac.jp/opac/opac_search/?direct=1&ou_srh=1&amode=2&lang=0&isbn=1000000000
 input: https://www.lib.sophia.ac.jp/opac/opac_openurl/?isbn=4326000481 //valid
 => https://www.lib.sophia.ac.jp/opac/opac_details/?lang=0&opkey=B170611882191096&srvce=0&amode=11&bibid=1003102195
 */
const getRedirectedUrl = async (targetUrl: string): Promise<string | undefined> => {
  try {
    const response = await fetch(targetUrl, {
      redirect: "follow"
    });
    return response.url;
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

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

const readCSV = async (filename: string) => {
  const data = await fs.readFile(filename, "utf-8");
  const parsedObj = parse(data, {
    header: true,
    complete: (results: ParseResult<Book>) => results
  });
  return parsedObj.data;
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

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      (async () => {
        if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
          await interceptedRequest.abort();
        } else {
          await interceptedRequest.continue();
        }
      })();
    });

    await page.goto(`${bookmeter_baseURI}/login`, {
      waitUntil: "domcontentloaded"
    });

    const accountNameInputHandle = await page.$x(XPATH.accountNameInput);
    const passwordInputHandle = await page.$x(XPATH.passwordInput);
    const loginButtonHandle = await page.$x(XPATH.loginButton);

    await accountNameInputHandle[0].type(bookmeter_username);
    await passwordInputHandle[0].type(bookmeter_password);

    await Promise.all([
      page.waitForNavigation({
        timeout: 2 * 60 * 1000,
        waitUntil: "domcontentloaded"
      }),
      (loginButtonHandle[0] as ElementHandle<Element>).click()
      // ref: https://github.com/puppeteer/puppeteer/issues/8852
    ]);

    console.log(`${JOB_NAME}: Login Completed!`);
    return this;
  }

  async explore(): Promise<Map<string, Book>> {
    const page = await this.#browser.newPage();
    let pageNum = 1;

    console.log(`${JOB_NAME}: Scraping Started!`);

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      (async () => {
        if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
          await interceptedRequest.abort();
        } else {
          await interceptedRequest.continue();
        }
      })();
    });

    for (;;) {
      await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/wish?page=${pageNum}`, {
        waitUntil: ["domcontentloaded"]
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

      console.log(`scanning page ${pageNum}`);

      // XPathで本の情報を取得し、そのelementHandleに要素が存在しなければループから抜ける
      if (isBookExistHandle.length == 0) {
        break;
      } else {
        pageNum++;
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
const isBookListDifferent = (latestList: BookList, prevList: BookList, noRemoteCheck: boolean = false): boolean => {
  if (noRemoteCheck) {
    return true; // 常に差分を検出したことにする
  }

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
const bulkFetchOpenBD = async (bookList: BookList): Promise<BiblioInfoStatus[]> => {
  const bulkTargetIsbns = [...bookList.values()].map((bookmeter) => bookmeter["isbn_or_asin"]).toString();
  const bookmeterKeys = Array.from(bookList.keys());

  const response: AxiosResponse<OpenBdResponse> = await axios({
    method: "get",
    url: `https://api.openbd.jp/v1/get?isbn=${bulkTargetIsbns}`,
    responseType: "json"
  });
  const results = [];

  for (const [bookmeterURL, bookResp] of zip(bookmeterKeys, response.data)) {
    if (bookResp === null) {
      //本の情報がなかった
      const statusText: BiblioinfoErrorStatus = "Not_found_in_OpenBD";
      const part = {
        book_title: statusText,
        author: statusText,
        publisher: statusText,
        published_date: statusText
      };
      results.push({
        book: { ...bookList.get(bookmeterURL)!, ...part },
        isFound: false
      });
    } else {
      //本の情報があった
      const bookinfo = bookResp.summary;
      const part = {
        book_title: bookinfo.title ?? "",
        author: bookinfo.author ?? "",
        publisher: bookinfo.publisher ?? "",
        published_date: bookinfo.pubdate ?? ""
      };
      results.push({
        book: { ...bookList.get(bookmeterURL)!, ...part },
        isFound: true
      });
    }
  }
  return results;
};

/**
 * 国立国会図書館 書誌検索
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */
const fetchNDL: FetchBiblioInfo = async (book: Book): Promise<BiblioInfoStatus> => {
  const isbn = book["isbn_or_asin"]; //ISBNデータを取得

  if (isbn === null || isbn === undefined) {
    //有効なISBNではない
    const statusText: BiblioinfoErrorStatus = "INVALID_ISBN";
    const part = {
      book_title: statusText,
      author: statusText,
      publisher: statusText,
      published_date: statusText
    };
    return {
      book: { ...book, ...part },
      isFound: false
    };
  }

  // xml形式でレスポンスが返ってくる
  const response: AxiosResponse<string> = await axios({
    url: `https://iss.ndl.go.jp/api/opensearch?isbn=${isbn}`,
    responseType: "text"
  });
  const parsedResult = fxp.parse(response.data) as NdlResponseJson; //xmlをjsonに変換
  const ndlResp = parsedResult.rss.channel;

  //本の情報があった
  if ("item" in ndlResp) {
    // 該当結果が単数か複数かによって、返却される値がObjectなのかArray<Object>なのか変わる。
    // fast-xml-parserの設定をいじれば多分もっとスマートにできると思うが、とりあえず目的を達成するにはこれだけ判定すれば十分。
    // 面倒なので、該当件数に関わらず配列の先頭だけをチェックしておく
    const bookinfo = Array.isArray(ndlResp.item) ? ndlResp.item[0] : ndlResp.item;
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
    const statusText: BiblioinfoErrorStatus = "Not_found_in_NDL";
    const part = {
      book_title: statusText,
      author: statusText,
      publisher: statusText,
      published_date: statusText
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
    const statusText: BiblioinfoErrorStatus = "INVALID_ISBN";
    const part = {
      book_title: statusText,
      author: statusText,
      publisher: statusText,
      published_date: statusText
    };
    return {
      book: { ...book, ...part },
      isFound: false
    };
  }

  //有効なISBNがある
  const response: AxiosResponse<GoogleBookApiResponse> = await axios({
    method: "get",
    url: `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${google_books_api_key}`,
    responseType: "json"
  });
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
    const statusText: BiblioinfoErrorStatus = "Not_found_in_GoogleBooks";
    const part = {
      book_title: statusText,
      author: statusText,
      publisher: statusText,
      published_date: statusText
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
    const statusText: BiblioinfoErrorStatus = "INVALID_ISBN";
    const part = {
      book_title: statusText,
      author: statusText,
      publisher: statusText,
      published_date: statusText
    };
    return {
      book: { ...config.book, ...part, [`exist_in_${library.tag}`]: "No" },
      isOwning: false
    };
  }

  // const title = encodeURIComponent(config.book["book_title"]);
  const url = `https://ci.nii.ac.jp/books/opensearch/search?isbn=${isbn}&kid=${library?.cinii_kid}&format=json&appid=${cinii_appid}`;
  const response: AxiosResponse<CiniiResponse> = await axios({
    method: "get",
    responseType: "json",
    url
  });
  const graph = response.data["@graph"][0];

  if ("items" in graph) {
    //検索結果が1件以上

    const ncidUrl = graph.items[0]["@id"];
    const ncid = ncidUrl.match(REGEX.ncid_in_cinii_url)?.[0]; //ciniiのURLからncidだけを抽出

    return {
      book: {
        ...config.book,
        [`exist_in_${library.tag}`]: "Yes",
        central_opac_link: `${library.opac}/opac/opac_openurl?ncid=${ncid}` //opacのリンク
      },
      isOwning: true
    };

  } else {
    //検索結果が0件

    // CiNiiに未登録なだけで、OPACには所蔵されている場合
    // 所蔵されているなら「"bibid"」がurlに含まれる
    const opacUrl = `${library.opac}/opac/opac_openurl?isbn=${isbn}`;
    const redirectedOpacUrl = await getRedirectedUrl(opacUrl);

    await sleep(1000);

    if (redirectedOpacUrl !== undefined && redirectedOpacUrl.includes("bibid")) {
      return {
        book: {
          ...config.book,
          [`exist_in_${library.tag}`]: "Yes",
          central_opac_link: opacUrl
        },
        isOwning: true
      };
    }

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
  const bookId = config.book.isbn_or_asin;
  const mathlibIsbnList = config.options?.resources;

  if (mathlibIsbnList === undefined) {
    throw new Error("the mathlib booklist is undefined");
  }

  if (bookId === null || bookId === undefined || !isIsbn10(bookId)) {
    return { book: { ...config.book }, isOwning: false };
  }

  const isbn13 = convertISBN10To13(bookId);

  if (mathlibIsbnList.has(bookId) || mathlibIsbnList.has(isbn13)) {
    const mathlib_opac_link = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn13}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;
    return {
      book: {
        ...config.book,
        exist_in_Sophia: "Yes",
        mathlib_opac_link
      },
      isOwning: true
    };
  } else {
    return { book: { ...config.book }, isOwning: false };
  }
};

const configMathlibBookList = async (listtype: keyof typeof MATH_LIB_BOOKLIST): Promise<Set<string>> => {
  const pdfUrl = MATH_LIB_BOOKLIST[listtype];
  const mathlibIsbnList: Set<string> = new Set();

  const filename = `mathlib_${listtype}.text`;
  const filehandle = await fs.open(filename, "w");

  for (const url of pdfUrl) {
    const response: AxiosResponse<Uint8Array> = await axios({
      method: "get",
      url,
      responseType: "arraybuffer",
      headers: {
        "Content-Type": "application/pdf"
      }
    });

    const rawPdf: Uint8Array = response["data"];
    const parsedPdf = await PdfData.extract(rawPdf, { sort: false });

    console.log(`${JOB_NAME}: Completed fetching the list of ${listtype} books in Sophia Univ. Math Lib`);

    for (const page of parsedPdf.text!) {
      const matchedIsbn = page.matchAll(REGEX.isbn);
      for (const match of matchedIsbn) {
        mathlibIsbnList.add(match[0]);
        await filehandle.appendFile(`${match[0]}\n`);
      }
    }
  }

  await filehandle.close();

  console.log(`${JOB_NAME}: Completed creating a list of ISBNs of ${listtype} books in Sophia Univ. Math Lib`);
  return mathlibIsbnList;
};

const fetchBiblioInfo = async (booklist: BookList): Promise<BookList> => {
  const mathLibIsbnList = await configMathlibBookList("ja");

  const updatedBookList = await bulkFetchOpenBD(booklist);

  const fetchOthers = async (bookInfo: BiblioInfoStatus) => {
    let updatedBook = { ...bookInfo };

    // NDL検索
    if (!updatedBook.isFound) {
      updatedBook = await fetchNDL(updatedBook.book);
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    // GoogleBooks検索
    if (!updatedBook.isFound) {
      updatedBook = await fetchGoogleBooks(updatedBook.book);
    }

    await sleep(randomWait(1500, 0.8, 1.2));

    // CiNii所蔵検索
    for (const tag of CINII_TARGET_TAGS) {
      const library = CINII_TARGETS.find((library) => library.tag === tag)!;
      const ciniiStatus = await searchCiNii({ book: updatedBook.book, options: { libraryInfo: library } });
      if (ciniiStatus.isOwning) {
        updatedBook.book = ciniiStatus.book;
      }
    }

    // 数学図書館所蔵検索
    const smlStatus = searchSophiaMathLib({
      book: updatedBook.book,
      options: { resources: mathLibIsbnList }
    });
    if (smlStatus.isOwning) {
      updatedBook.book = smlStatus.book;
    }

    booklist.set(updatedBook.book.bookmeter_url, updatedBook.book);
  };

  const ps = PromiseQueue();
  for (const book of updatedBookList) {
    ps.add(fetchOthers(book));
    await ps.wait(5); // 引数の指定量だけ並列実行
  }
  await ps.all(); // 端数分の処理の待ち合わせ

  console.log(`${JOB_NAME}: Searching Completed`);
  return new Map(booklist);
};

(async () => {
  try {
    const startTime = Date.now();
    const noRemoteCheck = false;
    if (noRemoteCheck) {
      console.log(`${JOB_NAME}: To check the remote is disabled`);
    }

    const browser = await launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: "new",
      slowMo: 15
    });

    const book = new Bookmaker(browser);
    const prevBookList = await getPrevBookList(CSV_FILENAME);
    const latestBookList = noRemoteCheck ? prevBookList : await book.login().then((book) => book.explore());

    await browser.close();

    if (isBookListDifferent(latestBookList, prevBookList, noRemoteCheck)) {
      console.log(`${JOB_NAME}: Fetching bibliographic information`);
      const updatedBooklist = await fetchBiblioInfo(latestBookList); //書誌情報取得

      await exportFile({
        fileName: CSV_FILENAME,
        payload: mapToArray(updatedBooklist),
        targetType: "csv",
        mode: "overwrite"
      }).then(() => {
        console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
      });
    }

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
