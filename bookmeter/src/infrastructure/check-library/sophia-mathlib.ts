import fs from "node:fs/promises";

import { extractTextFromPDF } from "../../../../.libs/utils";

import type { HttpClient } from "../../application/interfaces/http-client";
import type {
  LibraryHoldingsLookupCommand,
  LibraryHoldingsLookupper,
  LibraryLookupStatus
} from "@/application/check-library";
import type { ISBN10 } from "@/domain/book-id";
import type { CiniiTargetOrgs } from "@/domain/book-sources";
import type { AppError, Result } from "@/domain/error";

import { convertIsbn10To13, isAsin, PATTERNS } from "@/domain/book-id";
import { Err, InvalidIsbnError, isErr, Ok } from "@/domain/error";

/**
 * @link 数学図書館の図書リスト https://mathlib-sophia.opac.jp/opac/Notice/detail/108
 */
const MATH_LIB_BOOKLIST = {
  ja: [
    "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_j.pdf",
    "https://mathlib-sophia.opac.jp/opac/file/view/202404-202503.pdf"
  ],
  en_with_isbn: "https://mathlib-sophia.opac.jp/opac/file/view/1965-2023_F_1.pdf"
};
type MathLibBooklistType = keyof typeof MATH_LIB_BOOKLIST;

const updateLookupStatus = (
  status: LibraryLookupStatus,
  tag: CiniiTargetOrgs,
  value: boolean | null
): LibraryLookupStatus => ({
  ...status,
  [tag]: value
});

/**
 * 数学図書館の所蔵検索
 */
export const searchSophiaMathLib: LibraryHoldingsLookupper = (command: LibraryHoldingsLookupCommand) => {
  const book = command.input.book;
  const bookId = book.isbnOrAsin;
  const mathlibIsbnList = command.input.dataSource;

  if (mathlibIsbnList === undefined) {
    throw new Error("the mathlib booklist is undefined");
  }

  if (bookId === null || bookId === undefined || isAsin(bookId)) {
    return Err(new InvalidIsbnError(book.bookmeterUrl));
  }

  const isbn13 = convertIsbn10To13(bookId as ISBN10);
  const mathlibOpacLink = `https://mathlib-sophia.opac.jp/opac/Advanced_search/search?isbn=${isbn13}&mtl1=1&mtl2=1&mtl3=1&mtl4=1&mtl5=1`;

  if (mathlibIsbnList.has(bookId) || mathlibIsbnList.has(isbn13)) {
    return Ok({
      book: {
        ...book,
        exist_in_sophia: "Yes",
        sophiaMathlibOpac: mathlibOpacLink
      },
      lookupStatus: updateLookupStatus(command.input.lookupStatus, "sophia", true)
    });
  }

  return Ok({
    book: { ...book },
    lookupStatus: updateLookupStatus(command.input.lookupStatus, "sophia", false)
  });
};

async function configMathlibBookList(
  httpClient: HttpClient,
  listType: MathLibBooklistType
): Promise<Result<Set<string>, AppError>> {
  const pdfUrl = MATH_LIB_BOOKLIST[listType];
  const mathlibIsbnList: Set<string> = new Set();

  const filename = `mathlib_${listType}.txt`;
  const filehandle = await fs.open(filename, "w");

  for (const url of pdfUrl) {
    const response = await httpClient.get<Uint8Array>(url, {
      responseType: "arraybuffer",
      headers: {
        "Content-Type": "application/pdf"
      }
    });
    if (isErr(response)) {
      return Err(response.err);
    }
    const rawPdf = new Uint8Array(response.value.data);
    const parsedPdf = extractTextFromPDF(rawPdf);

    console.log(`Completed fetching the list of ${listType} books in Sophia Univ. Math Lib`);

    for await (const page of parsedPdf) {
      const matchedIsbn = page.matchAll(PATTERNS.isbn);
      for (const match of matchedIsbn) {
        mathlibIsbnList.add(match[0]);
        await filehandle.appendFile(`${match[0]}\n`);
      }
    }
  }

  await filehandle.close();

  console.log(`Completed creating a list of ISBNs of ${listType} books in Sophia Univ. Math Lib`);
  return Ok(mathlibIsbnList);
}
