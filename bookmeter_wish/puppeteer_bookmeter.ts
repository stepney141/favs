import { promises as fs } from "fs";

import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import papa from "papaparse";
import { PdfData } from "pdfdataextract";
import puppeteer from "puppeteer";

import "dotenv/config";

const process_description = "Bookmeter Wished Books";
const bookmeter_baseURI = "https://bookmeter.com";
const bookmeter_userID = "1003258";
const bookmeter_username = process.env.BOOKMETER_ACCOUNT.toString();
const bookmeter_password = process.env.BOOKMETER_PASSWORD.toString();
const cinii_appid = process.env.CINII_API_APPID.toString();
const main_library_id = "FA005358"; //上智大学図書館の機関ID ref: https://ci.nii.ac.jp/library/FA005358
const math_library_booklist = {
  //数学図書館の図書リスト ref: https://mathlib-sophia.opac.jp/opac/Notice/detail/108
  ja: "https://mathlib-sophia.opac.jp/opac/file/view/1965-2021_j.pdf",
  en_with_isbn: "https://mathlib-sophia.opac.jp/opac/file/view/1965-2021_F1.pdf"
};

const xpath = {
  isBookExist: "/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li",
  booksUrl: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a",
  amazonLink: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[4]/a",
  accountNameInput: '//*[@id="session_email_address"]',
  passwordInput: '//*[@id="session_password"]',
  loginButton: '//*[@id="js_sessions_new_form"]/form/div[4]/button'
};

const book_data_template = {
  bookmeter_url: "",
  isbn_or_asin: "",
  book_title: "",
  author: "",
  publisher: "",
  published_date: "",
  exist_in_sophia: "",
  central_opac_link: "",
  mathlib_opac_link: ""
};

// ref: http://absg.hatenablog.com/entry/2016/03/17/190831
// ref: https://regexr.com/3gk2s
// ref: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11143609671
const amazon_asin_regex = /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/;

// ref: https://www.oreilly.com/library/view/regular-expressions-cookbook/9781449327453/ch04s13.html
const isbn_regex =
  /(?=[0-9X]{10}|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}|97[89][0-9]{10}|(?=(?:[0-9]+[- ]){4})[- 0-9]{17})(?:97[89])?[0-9]{1,5}[0-9]+[0-9]+[0-9X]/g;

// ref: https://qiita.com/albno273/items/c2d48fdcbf3a9a3434db
// example: await sleep(randomWait(1000, 0.5, 1.1)); 1000ms x0.5 ~ x1.1 の間でランダムにアクセスの間隔を空ける
const sleep = async (time) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  });
const randomWait = (baseWaitSeconds, min, max) => baseWaitSeconds * (Math.random() * (max - min) + min);

const handleAxiosError = (error) => {
  // ref: https://gist.github.com/fgilio/230ccd514e9381fafa51608fcf137253
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    console.log(error.request);
  } else {
    console.log("Error", error);
  }
};

// ref: https://qiita.com/iz-j/items/27b9656ebed1a4516ee1
const convertIsbn10To13 = (isbn10) => {
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

class Bookmaker {
  constructor() {
    this.page_num = 1;
    this.wishBooksData = new Map();
    this.wishBooksData_Array = [];
    this.previousWishBooksData = new Map();
    this.MathLibIsbnList = new Set();
    this.fxp = new XMLParser();
  }

  // Amazon詳細リンクはアカウントにログインしなければ表示されないため、ログインする
  async loginToBookmeter(browser) {
    try {
      const page = await browser.newPage();

      await page.goto(`${bookmeter_baseURI}/login`, {
        waitUntil: "networkidle2"
      });

      const accountNameInputHandle = page.$x(xpath.accountNameInput);
      const passwordInputHandle = page.$x(xpath.passwordInput);
      const loginButtonHandle = page.$x(xpath.loginButton);

      await (await accountNameInputHandle)[0].type(bookmeter_username);
      await (await passwordInputHandle)[0].type(bookmeter_password);

      await Promise.all([
        page.waitForNavigation({
          timeout: 2 * 60 * 1000,
          waitUntil: "networkidle2"
        }),
        (await loginButtonHandle)[0].click()
      ]);

      console.log(`${process_description}: Login Completed!`);
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    return true;
  }

  async crowlBookmeter(browser) {
    try {
      const page = await browser.newPage();

      console.log(`${process_description}: Scraping Started!`);

      for (;;) {
        await page.goto(`${bookmeter_baseURI}/users/${bookmeter_userID}/books/wish?page=${this.page_num}`, {
          waitUntil: "networkidle2"
        });

        const booksUrlHandle = await page.$x(xpath.booksUrl);
        const amazonLinkHandle = await page.$x(xpath.amazonLink);

        for (let i = 0; i < booksUrlHandle.length; i++) {
          const bkmt_raw = await (await booksUrlHandle[i].getProperty("href")).jsonValue();
          const bkmt = String(bkmt_raw); //本の情報のbookmeter内部リンクを取得

          const amzn_raw = await (await amazonLinkHandle[i].getProperty("href")).jsonValue();
          const amzn = String(amzn_raw.match(amazon_asin_regex)); //Amazonへのリンクに含まれるISBN/ASINを抽出

          this.wishBooksData.set(bkmt, {
            //bookmeterの内部リンクをMapのキーにする
            ...book_data_template,
            bookmeter_url: bkmt,
            isbn_or_asin: amzn
          });
        }

        // 1500ms ~ 3300msの間でランダムにアクセスの間隔を空ける
        // await page.waitForTimeout(randomWait(3000, 0.5, 1.1));

        // XPathで本の情報を取得し、そのelementHandleに要素が存在しなければループから抜ける
        if ((await (await page.$x(xpath.isBookExist)).length) == 0) {
          break;
        } else {
          this.page_num++;
        }
      }
    } catch (e) {
      console.log(e);
      await browser.close();
      return false;
    }
    console.log(`${process_description}: Bookmeter Scraping Completed!`);
    return true;
  }

  async configureMathLibBookList(listtype) {
    try {
      const target_pdf_url = math_library_booklist[listtype];

      const response = await axios.get(target_pdf_url, {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/pdf"
        }
      });

      const pdf_data = response["data"];
      const pdf_parsed = await PdfData.extract(pdf_data, { sort: false });

      console.log(`${process_description}: Completed fetching the list of ${listtype} books in Sophia-Univ. Math Lib`);

      const filename = `mathlib_${listtype}.text`;
      const filehandle = await fs.open(filename, "w");

      for (const page of pdf_parsed.text) {
        const matched_all = page.matchAll(isbn_regex);
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
    console.log(
      `${process_description}: Completed creating a list of ISBNs of ${listtype} books in Sophia-Univ. Math Lib`
    );
    return true;
  }

  //OpenBD検索
  async searchOpenBD(key, books_obj) {
    const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

    try {
      if (isbn_data !== "null") {
        //正常系(与えるべきISBNがある)
        const response = await axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn_data}`);

        if (response.data[0] !== null) {
          //正常系(該当書籍発見)
          const fetched_data = response.data[0].summary;
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            bookmeter_url: key ?? "",
            isbn_or_asin: isbn_data ?? "",
            book_title: fetched_data.title ?? "",
            author: fetched_data.author ?? "",
            publisher: fetched_data.publisher ?? "",
            published_date: fetched_data.pubdate ?? ""
          });
        } else {
          //異常系(該当書籍なし)
          const status_text = "Not_found_with_OpenBD";
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            book_title: status_text,
            author: status_text,
            publisher: status_text,
            published_date: status_text
          });
        }
      } else {
        //異常系(与えるべきISBN自体がない)
        const status_text = "Not_found_with_Amazon";
        this.wishBooksData.set(key, {
          ...this.wishBooksData.get(key),
          book_title: status_text,
          author: status_text,
          publisher: status_text,
          published_date: status_text
        });
      }
    } catch (e) {
      console.log(e);
      handleAxiosError(e);
    }
  }

  // 国立国会図書館検索
  async searchNDL(key, books_obj) {
    const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

    try {
      if (isbn_data !== "null") {
        //正常系(与えるべきISBNがある)
        const response = await axios.get(`https://iss.ndl.go.jp/api/opensearch?isbn=${isbn_data}`); //xml形式でレスポンスが返ってくる
        const json_resp = this.fxp.parse(response.data); //xmlをjsonに変換
        const fetched_data = json_resp.rss.channel;

        if ("item" in fetched_data) {
          //正常系(該当書籍発見)
          /* 該当結果が単数か複数かによって、返却される値がObjectなのかArray<Object>なのか変わる
                    fast-xml-parserの設定をいじれば多分もっとスマートにできると思うが、とりあえず目的を達成するにはこれだけ判定すれば十分 */
          if (Number(fetched_data["openSearch:totalResults"]) == 1) {
            //該当件数が1件の場合
            this.wishBooksData.set(key, {
              ...this.wishBooksData.get(key),
              book_title: fetched_data.item["title"] ?? "",
              author: fetched_data.item["author"] ?? "",
              publisher: fetched_data.item["dc:publisher"] ?? "",
              published_date: fetched_data.item["pubDate"] ?? ""
            });
          } else if (Number(fetched_data["openSearch:totalResults"]) >= 2) {
            //該当件数が2件以上の場合
            this.wishBooksData.set(key, {
              //該当件数に関わらず、とりあえず配列の先頭にあるやつだけをチェックする
              ...this.wishBooksData.get(key),
              book_title: fetched_data.item[0]["title"] ?? "",
              author: fetched_data.item[0]["author"] ?? "",
              publisher: fetched_data.item[0]["dc:publisher"] ?? "",
              published_date: fetched_data.item[0]["pubDate"] ?? ""
            });
          }
        } else {
          //異常系(該当書籍なし)
          const status_text = "Not_found_with_NDL";
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            book_title: status_text,
            author: status_text,
            publisher: status_text,
            published_date: status_text
          });
        }
      } else {
        //異常系(与えるべきISBNがない)
        const status_text = "Not_found_with_Amazon";
        this.wishBooksData.set(key, {
          ...this.wishBooksData.get(key),
          book_title: status_text,
          author: status_text,
          publisher: status_text,
          published_date: status_text
        });
      }
    } catch (e) {
      console.log(e);
      handleAxiosError(e);
    }
  }

  //大学図書館所蔵検索
  async searchSophia(key, books_obj) {
    const isbn_data = books_obj["isbn_or_asin"]; //ISBNデータを取得

    try {
      if (isbn_data !== "null") {
        //正常系(与えるべきISBNがある)
        //中央図書館のチェック
        const response = await axios.get(
          `https://ci.nii.ac.jp/books/opensearch/search?appid=${cinii_appid}&format=json&fano=${main_library_id}&isbn=${isbn_data}`
        );
        const total_results = response.data["@graph"][0]["opensearch:totalResults"];

        if (total_results !== "0") {
          //検索結果が1件以上
          const ncid_url = response.data["@graph"][0].items[0]["@id"];
          const ncid = ncid_url.match(/(?<=https:\/\/ci.nii.ac.jp\/ncid\/).*/); //ciniiのURLからncidだけを抽出

          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            exist_in_sophia: "Yes", //検索結果が0件なら「No」、それ以外なら「Yes」
            central_opac_link: `https://www.lib.sophia.ac.jp/opac/opac_openurl?ncid=${ncid}` //opacのリンク
          });
        } else {
          //検索結果が0件
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            exist_in_sophia: "No" //検索結果が0件なら「No」、それ以外なら「Yes」
          });
        }

        //数学図書館のチェック
        if (this.MathLibIsbnList.has(isbn_data) || this.MathLibIsbnList.has(convertIsbn10To13(isbn_data))) {
          const mathlib_opac_link = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn_data}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;
          this.wishBooksData.set(key, {
            ...this.wishBooksData.get(key),
            exist_in_sophia: "Yes",
            mathlib_opac_link: mathlib_opac_link
          });
        }
      } else {
        //異常系(与えるべきISBN自体がない)
        this.wishBooksData.set(key, {
          ...this.wishBooksData.get(key),
          exist_in_sophia: this.wishBooksData.get(key)["book_title"] //とりあえず"book_title"の中にエラーメッセージ入っとるやろ！の精神
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
    console.log(`${process_description}: OpenBD Searching Completed`);

    for (const [key, value] of this.wishBooksData) {
      if (value["book_title"] === "Not_found_with_OpenBD") {
        await this.searchNDL(key, value);
        await sleep(1000);
      }
    }
    console.log(`${process_description}: NDL Searching Completed`);

    for (const [key, value] of this.wishBooksData) {
      await this.searchSophia(key, value);
      await sleep(1000);
    }
    console.log(`${process_description}: Sophia-Univ. Library Searching Completed`);
  }

  async writeFile(data, filename) {
    try {
      await fs.appendFile(`./${filename}`, data, (e) => {
        if (e) console.log("error: ", e);
      });
    } catch (e) {
      console.log("error: ", e.message);
      return false;
    }
    return true;
  }

  async writeCSV(array_data, filename) {
    try {
      const json_data = JSON.stringify(array_data, null, "  ");
      const csv_data = papa.unparse(json_data);

      const filehandle = await fs.open(filename, "w");
      await this.writeFile(csv_data, filename);
      await filehandle.close();
    } catch (e) {
      console.log("error: ", e.message);
      return false;
    }
    console.log(`${process_description}: CSV Output Completed!`);
    return true;
  }

  async readCSV(filename) {
    try {
      const data = await fs.readFile(filename, "utf-8");
      const parsed_obj = papa.parse(data, {
        header: true,
        complete: (results, file) => {
          return results;
        }
      });

      return parsed_obj.data;
    } catch (error) {
      console.error(error.message);
      process.exit(1); // 終了ステータス 1（一般的なエラー）としてプロセスを終了する
    }
  }

  async validateDiff(filename) {
    const file = await this.readCSV(filename);

    for (const obj of file) {
      this.previousWishBooksData.set(obj["bookmeter_url"], { ...obj });
    }

    for (const key of this.wishBooksData.keys()) {
      if (this.previousWishBooksData.has(key) === false) {
        //ローカルのCSVとbookmeterのスクレイピング結果を比較
        console.log(`${process_description}: Detected a diff between the local and remote.`); //差分を検出した場合
        return true;
      }
    }

    console.log(
      `${process_description}: Cannot find a diff between the local and remote. The process will be aborted...`
    ); //差分を検出しなかった場合
    // return true;
    return false;
  }
}

(async () => {
  const startTime = Date.now();

  const browser = await puppeteer.launch({
    defaultViewport: { width: 1000, height: 1000 },
    headless: true,
    // devtools: true,
    slowMo: 30
  });

  const book = new Bookmaker();
  const csv_filename = "bookmeter_wish_books.csv";

  await book.configureMathLibBookList("ja");

  await book.loginToBookmeter(browser);
  await book.crowlBookmeter(browser);

  if (await book.validateDiff(csv_filename)) {
    //ローカルのCSVとbookmeterのスクレイピング結果を比較し、差分を検出したら書誌情報を取得してCSVを新規生成
    console.log(`${process_description}: Fetching bibliographic information`);

    await book.fetchBiblioInfo(book.wishBooksData); //書誌情報取得

    for (const obj of book.wishBooksData.values()) {
      //Mapの値だけ抜き出してArrayにする
      book.wishBooksData_Array.push(obj);
    }

    await book.writeCSV(book.wishBooksData_Array, csv_filename); //ファイル出力
  }

  console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);

  await browser.close();
})();
