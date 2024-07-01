import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { sleep, zip } from "../.libs/utils";

import { REGEX } from "./constants";
import { convertISBN10To13, getRedirectedUrl, isIsbn10 } from "./utils";

import type {
  BookList,
  BiblioInfoStatus,
  OpenBD,
  BiblioinfoErrorStatus,
  Book,
  FetchBiblioInfo,
  NdlResponseJson,
  GoogleBookApiResponse,
  IsOwnBookConfig,
  BookOwningStatus,
  CiniiResponse,
  IsOwnBook
} from "./types";
import type { AxiosResponse } from "axios";

const fxp = new XMLParser();

/**
 * OpenBD検索
 */
export const bulkFetchOpenBD = async (bookList: BookList): Promise<BiblioInfoStatus[]> => {
  const bulkTargetIsbns = [...bookList.values()].map((bookmeter) => bookmeter["isbn_or_asin"]).toString();
  const bookmeterKeys = Array.from(bookList.keys());

  const response: AxiosResponse<OpenBD.Response> = await axios({
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
      const description = "";

      // if (bookResp.onix.CollateralDetail.TextContent !== undefined) {
      //   for (const text of bookResp.onix.CollateralDetail.TextContent) {
      //

      // description += text.Text.replace(/\r?\n/g, "<br>") + "<br>";
      //   }
      // }

      const part = {
        book_title: bookinfo.title ?? "",
        author: bookinfo.author ?? "",
        publisher: bookinfo.publisher ?? "",
        published_date: bookinfo.pubdate ?? "",
        description
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
export const fetchNDL: FetchBiblioInfo = async (book: Book): Promise<BiblioInfoStatus> => {
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
 * Google Booksの検索
 * @link https://developers.google.com/books/docs/v1/reference/volumes/list?hl=en
 */
export const fetchGoogleBooks: FetchBiblioInfo = async (book: Book, credential?: string): Promise<BiblioInfoStatus> => {
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
    url: `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${credential}`,
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
export const searchCiNii: IsOwnBook<null, Promise<BookOwningStatus>> = async (
  config: IsOwnBookConfig<null>,
  credential?: string
): Promise<BookOwningStatus> => {
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
  const url = `https://ci.nii.ac.jp/books/opensearch/search?isbn=${isbn}&kid=${library?.cinii_kid}&format=json&appid=${credential}`;
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
        [`${library.tag.toLowerCase()}_opac`]: `${library.opac}/opac/opac_openurl?ncid=${ncid}` //opacのリンク
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
          [`${library.tag.toLowerCase()}_opac`]: opacUrl
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
export const searchSophiaMathLib: IsOwnBook<Set<string>, BookOwningStatus> = (
  config: IsOwnBookConfig<Set<string>>
): BookOwningStatus => {
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
        sophia_mathlib_opac: mathlib_opac_link
      },
      isOwning: true
    };
  } else {
    return { book: { ...config.book }, isOwning: false };
  }
};
