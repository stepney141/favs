import { sleep } from "../../../../.libs/utils";
import { getRedirectedUrl } from "../utils";

import type {
  AsyncLibraryHoldingsLookupper,
  LibraryHoldingsLookupCommand,
  LibraryHoldingsLookupResult,
  LibraryLookupStatus
} from "@/application/check-library";
import type { CiniiTargetOrgs } from "@/domain/book-sources";
import type { Book, ExistIn, OpacLink } from "@/domain/entities/book";

import { isAsin, PATTERNS } from "@/domain/book-id";
import { Err, isErr, Ok, type AppError, type Result } from "@/domain/error";

export type CiNiiItem = {
  "@type": string;
  "@id": string;
  "dc:creator": string;
  "dc:title": string;
  "dc:publisher": string;
  "dc:pubDate": string;
  "dc:isbn": string;
};

type CiniiEmptyGraph = {
  "@type": string;
  "@id": string;
  "opensearch:totalResults": "0";
  "opensearch:startIndex": "0";
  "opensearch:itemsPerPage": "0";
};

type CiniiItemsGraph = {
  "@type": string;
  "@id": string;
  items: CiNiiItem[];
};

export type CiniiResponse = {
  "@graph": (CiniiEmptyGraph | CiniiItemsGraph)[];
  "@context": {
    dc: string;
    rdf: string;
    opensearch: string;
    rdfs: string;
    dcterms: string;
    prism: string;
    cinii: string;
    "@vocab": string;
  };
};

type BibliographicUpdate = Partial<Pick<Book, "title" | "author" | "publisher" | "publishedDate">>;
type OwnershipColumns = Partial<Pick<Book, ExistIn | OpacLink>>;
type ExistenceColumns = Partial<Pick<Book, ExistIn>>;

const isItemsGraph = (graph: CiniiEmptyGraph | CiniiItemsGraph | undefined): graph is CiniiItemsGraph => {
  return typeof graph === "object" && graph !== null && "items" in graph;
};

const buildMetadataUpdate = (item: CiNiiItem): BibliographicUpdate => {
  const update: BibliographicUpdate = {};
  if (item["dc:title"]) {
    update.title = item["dc:title"];
  }
  if (item["dc:creator"]) {
    update.author = item["dc:creator"];
  }
  if (item["dc:publisher"]) {
    update.publisher = item["dc:publisher"];
  }
  if (item["dc:pubDate"]) {
    update.publishedDate = item["dc:pubDate"];
  }
  return update;
};

const createOwningColumns = (tag: CiniiTargetOrgs, opacUrl: string): OwnershipColumns => {
  const existKey = `exist_in_${tag}`;
  const opacKey = `${tag}_opac`;
  return {
    [existKey]: "Yes",
    [opacKey]: opacUrl
  } as OwnershipColumns;
};

const createMissingColumns = (tag: CiniiTargetOrgs): ExistenceColumns => {
  const existKey = `exist_in_${tag}`;
  return {
    [existKey]: "No"
  } as ExistenceColumns;
};

const updateLookupStatusMap = (
  status: LibraryLookupStatus,
  tag: CiniiTargetOrgs,
  value: boolean | null
): LibraryLookupStatus => ({
  ...status,
  [tag]: value
});

const buildResult = (
  command: LibraryHoldingsLookupCommand,
  bookUpdates: Partial<Book>,
  status: boolean | null
): Result<LibraryHoldingsLookupResult, AppError> => {
  const updatedBook: Book = { ...command.input.book, ...bookUpdates };
  return Ok({
    book: updatedBook,
    lookupStatus: updateLookupStatusMap(command.input.lookupStatus, command.input.targetLibrary.tag, status)
  });
};

/**
 * 大学図書館 所蔵検索(CiNii)
 * @link https://support.nii.ac.jp/ja/cib/api/b_opensearch
 */
export const isBookAvailableInCinii: AsyncLibraryHoldingsLookupper = async (
  command: LibraryHoldingsLookupCommand
): Promise<Result<LibraryHoldingsLookupResult, AppError>> => {
  const {
    input: { book, credentials, targetLibrary },
    dependencies: { httpClient }
  } = command;

  if (!credentials?.ciniiAppId) {
    return Err(new Error("CiNii API credentials are missing"));
  }

  const identifier = book.isbnOrAsin;
  const encodedTitle = encodeURIComponent(book.title);
  const encodedAuthor = encodeURIComponent(book.author);
  const canUseIsbnQuery = identifier !== null && !isAsin(identifier);
  const encodedIdentifier = identifier !== null ? encodeURIComponent(identifier) : "";
  const query = canUseIsbnQuery ? `isbn=${encodedIdentifier}` : `title=${encodedTitle}&author=${encodedAuthor}`;
  const url = `https://ci.nii.ac.jp/books/opensearch/search?${query}&kid=${targetLibrary.ciniiKid}&format=json&appid=${credentials.ciniiAppId}`;

  const response = await httpClient.get<CiniiResponse>(url, { responseType: "json" });
  if (isErr(response)) {
    return Err(response.err);
  }

  const fallbackOpacUrl = canUseIsbnQuery
    ? `${targetLibrary.opac}/opac/opac_openurl?isbn=${encodedIdentifier}`
    : `${targetLibrary.opac}/opac/opac_openurl?title=${encodedTitle}&author=${encodedAuthor}`;

  const graph = response.value.data["@graph"]?.[0];
  if (isItemsGraph(graph) && graph.items.length > 0) {
    //検索結果が1件以上
    const item = graph.items[0];
    const ncid = item["@id"]?.match(PATTERNS.ncidInCiniiUrl)?.[0];
    const opacUrl = ncid ? `${targetLibrary.opac}/opac/opac_openurl?ncid=${ncid}` : fallbackOpacUrl;

    // 書誌情報をCiNiiのデータで更新する
    // 他のAPIで情報が見つかっている場合は上書きしない
    const metadataUpdates = command.kind === "Not_found" ? buildMetadataUpdate(item) : {};
    const columns = createOwningColumns(targetLibrary.tag, opacUrl);
    return buildResult(command, { ...metadataUpdates, ...columns }, true);
  }

  const redirectedOpacUrlResult = await getRedirectedUrl(fallbackOpacUrl);
  if (isErr(redirectedOpacUrlResult)) {
    return Err(redirectedOpacUrlResult.err);
  }
  await sleep(1000);

  const redirectedOpacUrl = redirectedOpacUrlResult.value;

  // 所蔵されているなら「"bibid"」がurlに含まれる
  if (redirectedOpacUrl.includes("bibid")) {
    const columns = createOwningColumns(targetLibrary.tag, fallbackOpacUrl);
    return buildResult(command, columns, true);
  }

  const missingColumns = createMissingColumns(targetLibrary.tag);
  return buildResult(command, missingColumns, false);
};
