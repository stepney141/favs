import type { ASIN, BookmeterUrl, ISBN10 } from "../book-id";
import type { CiniiTargetOrgs } from "../book-sources";

export type Book = {
  bookmeterUrl: BookmeterUrl;
  isbnOrAsin: ISBN10 | ASIN;
  title: string;
  author: string;
  publisher: string;
  publishedDate: string;
} & {
  [key in OpacLink]: string;
} & {
  [key in ExistIn]: "Yes" | "No";
} & {
  sophiaMathlibOpac: string;
  description: string;
};

export type ExistIn = `exist_in_${CiniiTargetOrgs}`;
export type OpacLink = `${Lowercase<CiniiTargetOrgs>}_opac`;

export interface CreateBookParams {
  bookmeterUrl: BookmeterUrl;
  isbnOrAsin: ISBN10 | ASIN;
  title?: string;
  author?: string;
  publisher?: string;
  publishedDate?: string;
}

export function createNewBook(params: CreateBookParams): Book {
  return {
    ...params,
    title: params.title ?? "",
    author: params.author ?? "",
    publisher: "",
    publishedDate: "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    sophia_opac: "",
    utokyo_opac: "",
    sophiaMathlibOpac: "",
    description: ""
  };
}
