import { promises as fs } from "fs";
import path from "path";

import axios from "axios";
import { config } from "dotenv";
import { XMLParser } from "fast-xml-parser";
import { parse, unparse } from "papaparse";
import { PdfData } from "pdfdataextract";
import puppeteer from "puppeteer";

import { handleAxiosError, randomWait, sleep } from "../.libs/utils";

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
  BookDataTemplate,
  OpenBdResponse,
  CiniiResponse,
  NdlResponseJson,
  BIBLIOINFO_ERROR_STATUS
} from "./types";
import type { AxiosResponse } from "axios";
import type { ParseResult } from "papaparse";
import type { Browser, ElementHandle } from "puppeteer";

config({ path: path.join(__dirname, "../.env") });
const bookmeter_username = process.env.BOOKMETER_ACCOUNT!.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD!.toString();
const cinii_appid = process.env.CINII_API_APPID!.toString();

// ref: https://qiita.com/iz-j/items/27b9656ebed1a4516ee1
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

const fxp = new XMLParser();

class Bookmaker {
  page_num: number;
  wishBooksData: Map<string, BookDataTemplate>;
  wishBooksData_Array: BookDataTemplate[];
  previousWishBooksData: Map<string, BookDataTemplate>;
  MathLibIsbnList: Set<string>;

  constructor() {
    this.page_num = 1;
    this.wishBooksData = new Map();
    this.wishBooksData_Array = [];
    this.previousWishBooksData = new Map();
    this.MathLibIsbnList = new Set();
  }

  /**
   * Amazon詳細リンクはアカウントにログインしなければ表示されないため、ログインする
   */
  async login(browser: Browser) {
    try {
      const page = await browser.newPage();

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
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    return true;
  }

  async crawl(browser: Browser) {
    try {
      const page = await browser.newPage();

      console.log(`${JOB_NAME}: Scraping Started!`);

      for (;;) {
        // 1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
        await sleep(randomWait(3000, 0.5, 1.1));

        await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/wish?page=${this.page_num}`, {
          waitUntil: ["domcontentloaded", "networkidle0"]
        });

        const booksUrlHandle = await page.$x(XPATH.booksUrl);
        const amazonLinkHandle = await page.$x(XPATH.amazonLink);
        const isBookExistHandle = await page.$x(XPATH.isBookExist);

        for (let i = 0; i < booksUrlHandle.length; i++) {
          const bkmt_raw = await (await booksUrlHandle[i].getProperty("href")).jsonValue();
          const bkmt = String(bkmt_raw); //本の情報のbookmeter内部リンクを取得

          const amzn_raw = await (await amazonLinkHandle[i].getProperty("href")).jsonValue();
          const amzn = String((amzn_raw as string).match(REGEX.amazon_asin)); //Amazonへのリンクに含まれるISBN/ASINを抽出

          this.wishBooksData.set(bkmt, {
            //bookmeterの内部リンクをMapのキーにする
            ...({
              bookmeter_url: "",
              isbn_or_asin: "",
              book_title: "",
              author: "",
              publisher: "",
              published_date: "",
              exist_in_sophia: "",
              central_opac_link: "",
              mathlib_opac_link: ""
            } satisfies BookDataTemplate),
            bookmeter_url: bkmt,
            isbn_or_asin: amzn
          });
        }

        // XPathで本の情報を取得し、そのelementHandleに要素が存在しなければループから抜ける
        if (isBookExistHandle.length == 0) {
          break;
        } else {
          this.page_num++;
        }

        console.log(this.page_num);
      }
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    console.log(`${JOB_NAME}: Bookmeter Scraping Completed!`);
    return true;
  }

  async configureMathLibBookList(listtype: keyof typeof MATH_LIB_BOOKLIST) {
    try {
      const target_pdf_url = MATH_LIB_BOOKLIST[listtype];

      const response: AxiosResponse<Uint8Array> = await axios.get(target_pdf_url, {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/pdf"
        }
      });

      const pdf_data: Uint8Array = response["data"];
      const pdf_parsed = await PdfData.extract(pdf_data, { sort: false });

      console.log(`${JOB_NAME}: Completed fetching the list of ${listtype} books in Sophia-Univ. Math Lib`);

      const filename = `mathlib_${listtype}.text`;
      const filehandle = await fs.open(filename, "w");

      for (const page of pdf_parsed.text!) {
        const matched_all = page.matchAll(REGEX.isbn);
        for (const match of matched_all) {
          this.MathLibIsbnList.add(match[0]);
          await this.writeFile(`${match[0]}\n`, filename);
        }
      }

      await filehandle.close();
    } catch (e) {
      console.log(e);
      handleAxiosError(e);
      return false;
    }
    console.log(`${JOB_NAME}: Completed creating a list of ISBNs of ${listtype} books in Sophia-Univ. Math Lib`);
    return true;
  }

  /**
   * OpenBD検索
   */
  async searchOpenBD(key: string, books_obj: BookDataTemplate) {
    const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

    try {
      if (isbn_data !== "null") {
        //正常系(与えるべきISBNがある)
        const response: AxiosResponse<OpenBdResponse> = await axios.get(
          `https://api.openbd.jp/v1/get?isbn=${isbn_data}`
        );

        //正常系(該当書籍発見)
        if (response.data[0] !== null) {
          const fetched_data = response.data[0].summary;
          const part = {
            bookmeter_url: key ?? "",
            isbn_or_asin: isbn_data ?? "",
            book_title: fetched_data.title ?? "",
            author: fetched_data.author ?? "",
            publisher: fetched_data.publisher ?? "",
            published_date: fetched_data.pubdate ?? ""
          };

          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            ...part
          } satisfies BookDataTemplate);

          //異常系(該当書籍なし)
        } else {
          const status_text: BIBLIOINFO_ERROR_STATUS = "Not_found_with_OpenBD";
          const part = {
            book_title: status_text,
            author: status_text,
            publisher: status_text,
            published_date: status_text
          };

          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            ...part
          } satisfies BookDataTemplate);
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

        this.wishBooksData.set(key, {
          ...this.wishBooksData.get(key),
          ...part
        } satisfies BookDataTemplate);
      }
    } catch (e) {
      console.log(e);
      handleAxiosError(e);
    }
  }

  /**
   * 国立国会図書館検索
   */
  async searchNDL(key: string, books_obj: BookDataTemplate) {
    const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

    try {
      //正常系(与えるべきISBNがある)
      if (isbn_data !== "null") {
        const response: AxiosResponse = await axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn_data}`); //xml形式でレスポンスが返ってくる
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
            this.wishBooksData.set(key, {
              ...this.wishBooksData.get(key),
              ...part
            } satisfies BookDataTemplate);

            //該当件数が2件以上の場合
          } else {
            //該当件数に関わらず、とりあえず配列の先頭にあるやつだけをチェックする
            const part = {
              book_title: fetched_data.item[0]["title"] ?? "",
              author: fetched_data.item[0]["author"] ?? "",
              publisher: fetched_data.item[0]["dc:publisher"] ?? "",
              published_date: fetched_data.item[0]["pubDate"] ?? ""
            };
            this.wishBooksData.set(key, {
              ...this.wishBooksData.get(key),
              ...part
            } satisfies BookDataTemplate);
          }

          //異常系(該当書籍なし)
        } else {
          const status_text: BIBLIOINFO_ERROR_STATUS = "Not_found_with_NDL";
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            book_title: status_text,
            author: status_text,
            publisher: status_text,
            published_date: status_text
          } satisfies BookDataTemplate);
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
        this.wishBooksData.set(key, {
          ...this.wishBooksData.get(key),
          ...part
        } satisfies BookDataTemplate);
      }
    } catch (e) {
      console.log(e);
      handleAxiosError(e);
    }
  }

  /**
   * 大学図書館所蔵検索
   */
  async searchSophia(key: string, books_obj: BookDataTemplate) {
    const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

    try {
      //正常系(与えるべきISBNがある)
      if (isbn_data !== "null") {
        //中央図書館のチェック
        const response: AxiosResponse<CiniiResponse> = await axios.get(
          `https://ci.nii.ac.jp/books/opensearch/search?appid=${cinii_appid}&format=json&fano=${SOPHIA_LIB_CINII_ID}&isbn=${isbn_data}`
        );
        const total_results = response.data["@graph"][0]["opensearch:totalResults"];

        //検索結果が1件以上
        if (total_results !== "0") {
          const ncid_url = response.data["@graph"][0].items[0]["@id"];
          const ncid = ncid_url.match(REGEX.ncid_in_cinii_url)?.[0]; //ciniiのURLからncidだけを抽出

          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            exist_in_sophia: "Yes", //検索結果が0件なら「No」、それ以外なら「Yes」
            central_opac_link: `${OPAC_URL.sophia}/opac/opac_openurl?ncid=${ncid}` //opacのリンク
          } satisfies BookDataTemplate);

          //検索結果が0件
        } else {
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            exist_in_sophia: "No" //検索結果が0件なら「No」、それ以外なら「Yes」
          } satisfies BookDataTemplate);
        }

        //数学図書館のチェック
        if (this.MathLibIsbnList.has(isbn_data!) || this.MathLibIsbnList.has(convertISBN10To13(isbn_data!))) {
          const mathlib_opac_link = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn_data}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            exist_in_sophia: "Yes",
            mathlib_opac_link: mathlib_opac_link
          });
        }

        //異常系(与えるべきISBN自体がない)
      } else {
        this.wishBooksData.set(key, {
          ...this.wishBooksData.get(key),
          exist_in_sophia: "No"
          // exist_in_sophia: this.wishBooksData.get(key)!["book_title"] //とりあえず"book_title"の中にエラーメッセージ入っとるやろ！の精神
        });
      }
    } catch (e) {
      console.log(e);
      handleAxiosError(e);
    }
  }

  async fetchBiblioInfo() {
    for (const [key, value] of this.wishBooksData) {
      await this.searchOpenBD(key, value);
      // await sleep(1000);
    }
    console.log(`${JOB_NAME}: OpenBD Searching Completed`);

    for (const [key, value] of this.wishBooksData) {
      if (value["book_title"] === "Not_found_with_OpenBD") {
        await this.searchNDL(key, value);
        await sleep(1000);
      }
    }
    console.log(`${JOB_NAME}: NDL Searching Completed`);

    for (const [key, value] of this.wishBooksData) {
      await this.searchSophia(key, value);
      await sleep(1000);
    }
    console.log(`${JOB_NAME}: Sophia-Univ. Library Searching Completed`);
  }

  async writeFile(data: string, filename: string) {
    try {
      await fs.appendFile(`./${filename}`, data);
    } catch (e) {
      if (e instanceof Error) {
        console.log("error: ", e.message);
        return false;
      }
    }
    return true;
  }

  async writeCSV(array_data: BookDataTemplate[], filename: string) {
    try {
      const json_data = JSON.stringify(array_data, null, "  ");
      const csv_data = unparse(json_data);

      const filehandle = await fs.open(filename, "w");
      await this.writeFile(csv_data, filename);
      await filehandle.close();
    } catch (e) {
      if (e instanceof Error) {
        console.log("error: ", e.message);
        return false;
      }
    }
    console.log(`${JOB_NAME}: CSV Output Completed!`);
    return true;
  }

  async readCSV(filename: string) {
    try {
      const data = await fs.readFile(filename, "utf-8");
      const parsed_obj = parse(data, {
        header: true,
        complete: (results: ParseResult<BookDataTemplate>) => results
      });

      return parsed_obj.data;
    } catch (e) {
      if (e instanceof Error) {
        console.error(e.message);
        process.exit(1); // 終了ステータス 1（一般的なエラー）としてプロセスを終了する
      }
    }
  }

  async validateDiff(filename: string) {
    const file = await this.readCSV(filename);

    for (const obj of file!) {
      this.previousWishBooksData.set(obj["bookmeter_url"]!, { ...obj });
    }

    for (const key of this.wishBooksData.keys()) {
      if (this.previousWishBooksData.has(key) === false) {
        //ローカルのCSVとbookmeterのスクレイピング結果を比較
        console.log(`${JOB_NAME}: Detected some diffs between the local and remote.`); //差分を検出した場合
        return true;
      }
    }

    //差分を検出しなかった場合
    console.log(
      `${JOB_NAME}: Cannot find any differences between the local and remote. The process will be aborted...`
    );
    return false;
  }
}

(async () => {
  try {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: "new",
      slowMo: 30
    });

    const book = new Bookmaker();

    await book.configureMathLibBookList("ja");

    await book.login(browser);
    await book.crawl(browser);

    if (await book.validateDiff(CSV_FILENAME)) {
      //ローカルのCSVとbookmeterのスクレイピング結果を比較し、差分を検出したら書誌情報を取得してCSVを新規生成
      console.log(`${JOB_NAME}: Fetching bibliographic information`);

      await book.fetchBiblioInfo(); //書誌情報取得

      for (const obj of book.wishBooksData.values()) {
        //Mapの値だけ抜き出してArrayにする
        book.wishBooksData_Array.push(obj);
      }

      await book.writeCSV(book.wishBooksData_Array, CSV_FILENAME); //ファイル出力
    }

    console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
