import fs from "node:fs/promises";

import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { extractTextFromPDF, PromiseQueue, randomWait, sleep, zip } from "../.libs/utils";

import { CINII_TARGET_TAGS, CINII_TARGETS, JOB_NAME, MATH_LIB_BOOKLIST, REGEX } from "./constants";
import { convertISBN10To13, getRedirectedUrl, isAsin, isIsbn10 } from "./utils";

import type {
  BookList,
  BookSearchState,
  OpenBD,
  BiblioinfoErrorStatus,
  Book,
  NdlResponseJson,
  GoogleBookApiResponse,
  BookOwningStatus,
  CiniiResponse,
  ISBN10,
  IsbnDb,
  CiniiTarget
} from "./types";
import type { AxiosResponse } from "axios";

const fxp = new XMLParser();

/**
 * OpenBD検索
 */
const bulkFetchOpenBD = async (bookList: BookList): Promise<BookSearchState[]> => {
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

      const title = bookinfo.title === "" ? "" : `${bookinfo.title}`;
      const volume = bookinfo.volume === "" ? "" : ` ${bookinfo.volume}`;
      const series = bookinfo.series === "" ? "" : ` (${bookinfo.series})`;

      const part = {
        book_title: `${title}${volume}${series}`,
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
 * ISBNdb検索
 */
const fetchISBNdb = async (book: Book, credential: string): Promise<BookSearchState> => {
  const isbn = book["isbn_or_asin"]!;
  const ISBNDB_API_URI = "https://api.pro.isbndb.com";

  const instanse = axios.create({
    validateStatus: (status) => (status >= 200 && status < 300) || status == 404
  });
  const rawResponse: AxiosResponse<IsbnDb.SingleResponse> = await instanse({
    url: `${ISBNDB_API_URI}/book/${isbn}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: credential
    },
    responseType: "json"
  });

  if ("errorMessage" in rawResponse.data || rawResponse.status === 404) {
    const statusText: BiblioinfoErrorStatus = "Not_found_in_ISBNdb";
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

  const bookinfo = rawResponse.data.book;
  const part = {
    book_title: bookinfo["title"] ?? "",
    author: bookinfo["authors"]?.toString() ?? "",
    publisher: bookinfo["publisher"] ?? "",
    published_date: bookinfo["date_published"] ?? ""
  };
  return {
    book: { ...book, ...part },
    isFound: true
  };
};

/**
 * 国立国会図書館 書誌検索
 * @link https://iss.ndl.go.jp/information/api/riyou/
 */
const fetchNDL = async (book: Book, useIsbn: boolean = true): Promise<BookSearchState> => {
  const isbn = book["isbn_or_asin"]!;
  const title = encodeURIComponent(book["book_title"]);
  const author = encodeURIComponent(book["author"]);

  const query = isIsbn10(isbn) ? `isbn=${isbn}` : `any=${title} ${author}`;

  // xml形式でレスポンスが返ってくる
  const response: AxiosResponse<string> = await axios({
    url: `https://ndlsearch.ndl.go.jp/api/opensearch?${query}`,
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

    const title = bookinfo["title"] ?? "";
    const volume = bookinfo["dcndl:volume"] ?? "";
    const series = bookinfo["dcndl:seriesTitle"] ?? "";

    const part = {
      book_title: `${title || title + " "}${volume || volume + " "}${series || "(" + series + ")"}`,
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
    if (useIsbn) {
      // ISBNで検索しても情報がなかった場合、タイトルと著者で再検索
      return await fetchNDL(book, false);
    }

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
const fetchGoogleBooks = async (book: Book, credential: string): Promise<BookSearchState> => {
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
    const subtitle = bookinfo.subtitle ?? "";
    const part = {
      book_title: `${bookinfo.title}${subtitle || " " + subtitle}`,
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
const isBookAvailableInCinii = async (
  biblioInfo: BookSearchState,
  libraryInfo: CiniiTarget,
  credential: string
): Promise<BookOwningStatus> => {
  const isbn = biblioInfo.book["isbn_or_asin"]; //ISBNデータを取得
  const title = encodeURIComponent(biblioInfo.book["book_title"]);
  const author = encodeURIComponent(biblioInfo.book["author"]);

  if (libraryInfo === undefined) {
    throw new Error("The library info is undefined");
  }

  const query = isbn === null || isAsin(isbn) ? `title=${title}&author=${author}` : `isbn=${isbn}`;
  const url = `https://ci.nii.ac.jp/books/opensearch/search?${query}&kid=${libraryInfo.cinii_kid}&format=json&appid=${credential}`;
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

    const infoToUpdate = {
      book_title: graph.items[0]["dc:title"],
      author: graph.items[0]["dc:creator"],
      publisher: graph.items[0]["dc:publisher"],
      published_date: graph.items[0]["dc:pubDate"]
    };
    const owingStatus = {
      [`exist_in_${libraryInfo.tag}`]: "Yes",
      [`${libraryInfo.tag.toLowerCase()}_opac`]: `${libraryInfo.opac}/opac/opac_openurl?ncid=${ncid}` //opacのリンク
    };

    if (!biblioInfo.isFound) {
      return {
        book: {
          ...biblioInfo.book,
          ...infoToUpdate,
          ...owingStatus
        },
        isFound: true,
        isOwning: true
      };
    } else {
      // 他のAPIで情報が見つかっている場合は上書きしない
      return {
        book: {
          ...biblioInfo.book,
          ...owingStatus
        },
        isFound: false,
        isOwning: true
      };
    }
  } else {
    //検索結果が0件

    // CiNiiに未登録なだけで、OPACには所蔵されている場合
    // 所蔵されているなら「"bibid"」がurlに含まれる
    const opacUrl = `${libraryInfo.opac}/opac/opac_openurl?isbn=${isbn}`;
    const redirectedOpacUrl = await getRedirectedUrl(opacUrl);

    await sleep(1000);

    if (redirectedOpacUrl !== undefined && redirectedOpacUrl.includes("bibid")) {
      return {
        book: {
          ...biblioInfo.book,
          [`exist_in_${libraryInfo.tag}`]: "Yes",
          [`${libraryInfo.tag.toLowerCase()}_opac`]: opacUrl
        },
        isFound: true,
        isOwning: true
      };
    }

    return {
      book: { ...biblioInfo.book, [`exist_in_${libraryInfo.tag}`]: "No" },
      isFound: false,
      isOwning: false
    };
  }
};

/**
 * 数学図書館の所蔵検索
 */
const searchSophiaMathLib = (book: Book, dataSource: Set<string>): BookOwningStatus => {
  const bookId = book.isbn_or_asin;
  const mathlibIsbnList = dataSource;

  if (mathlibIsbnList === undefined) {
    throw new Error("the mathlib booklist is undefined");
  }

  if (bookId === null || bookId === undefined || !isIsbn10(bookId)) {
    return { book: { ...book }, isOwning: false };
  }

  const isbn13 = convertISBN10To13(bookId as ISBN10);

  if (mathlibIsbnList.has(bookId) || mathlibIsbnList.has(isbn13)) {
    const mathlib_opac_link = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn13}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;
    return {
      book: {
        ...book,
        exist_in_Sophia: "Yes",
        sophia_mathlib_opac: mathlib_opac_link
      },
      isOwning: true
    };
  } else {
    return { book: { ...book }, isOwning: false };
  }
};

const configMathlibBookList = async (listtype: keyof typeof MATH_LIB_BOOKLIST): Promise<Set<string>> => {
  const pdfUrl = MATH_LIB_BOOKLIST[listtype];
  const mathlibIsbnList: Set<string> = new Set();

  const filename = `mathlib_${listtype}.txt`;
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

    const rawPdf: Uint8Array = new Uint8Array(response["data"]);
    const parsedPdf = extractTextFromPDF(rawPdf);

    console.log(`${JOB_NAME}: Completed fetching the list of ${listtype} books in Sophia Univ. Math Lib`);

    for await (const page of parsedPdf) {
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

const fetchSingleRequestAPIs = async (
  searchState: BookSearchState,
  credential: { cinii: string; google: string; isbnDb: string },
  mathLibIsbnList: Set<string>
): Promise<{ bookmeterUrl: string; updatedBook: Book }> => {
  let updatedSearchState = { ...searchState };

  // ISBNdb検索
  if (!updatedSearchState.isFound) {
    updatedSearchState = await fetchISBNdb(updatedSearchState.book, credential.isbnDb);
  }

  // NDL検索
  if (!updatedSearchState.isFound) {
    updatedSearchState = await fetchNDL(updatedSearchState.book);
  }

  await sleep(randomWait(1500, 0.8, 1.2));

  // GoogleBooks検索
  if (!updatedSearchState.isFound) {
    updatedSearchState = await fetchGoogleBooks(updatedSearchState.book, credential.google);
  }

  await sleep(randomWait(1500, 0.8, 1.2));

  // CiNii所蔵検索
  for (const tag of CINII_TARGET_TAGS) {
    const library = CINII_TARGETS.find((library) => library.tag === tag)!;
    const ciniiStatus = await isBookAvailableInCinii(updatedSearchState, library, credential.cinii);
    if (ciniiStatus.isOwning || ciniiStatus?.isFound) {
      updatedSearchState.book = ciniiStatus.book;
    }
  }

  // 数学図書館所蔵検索
  const smlStatus = searchSophiaMathLib(updatedSearchState.book, mathLibIsbnList);
  if (smlStatus.isOwning) {
    updatedSearchState.book = smlStatus.book;
  }

  return {
    bookmeterUrl: updatedSearchState.book.bookmeter_url,
    updatedBook: updatedSearchState.book
  };
};

export const fetchBiblioInfo = async (
  booklist: BookList,
  credential: { cinii: string; google: string; isbnDb: string }
): Promise<BookList> => {
  const mathLibIsbnList = await configMathlibBookList("ja");

  // OpenBD検索
  const bookInfoList = await bulkFetchOpenBD(booklist);

  const ps = PromiseQueue();
  for (const bookInfo of bookInfoList) {
    ps.add(fetchSingleRequestAPIs(bookInfo, credential, mathLibIsbnList));
    const value = (await ps.wait(5)) as false | { bookmeterUrl: string; updatedBook: Book }; // 引数の指定量だけ並列実行
    if (value !== false) booklist.set(value.bookmeterUrl, value.updatedBook);
  }
  ((await ps.all()) as { bookmeterUrl: string; updatedBook: Book }[]).forEach((v) => {
    booklist.set(v.bookmeterUrl, v.updatedBook);
  }); // 端数分の処理の待ち合わせ

  console.log(`${JOB_NAME}: Searching Completed`);
  return new Map(booklist);
};
