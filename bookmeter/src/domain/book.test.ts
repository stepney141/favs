import { describe, expect, it } from "vitest";

import { isBookListDifferent } from "./book";

import type { Book, BookList } from "./book";
import type { ISBN10 } from "./isbn";

const makeBook = (bookmeterUrl: string): Book => {
  return {
    bookmeter_url: bookmeterUrl,
    isbn_or_asin: "1234567890" as ISBN10,
    book_title: `title:${bookmeterUrl}`,
    author: "author",
    publisher: "publisher",
    published_date: "2024-01-01",
    sophia_opac: "",
    utokyo_opac: "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    sophia_mathlib_opac: "",
    description: ""
  };
};

const toBookList = (urls: string[]): BookList => {
  return new Map(urls.map((url) => [url, makeBook(url)]));
};

describe("isBookListDifferent", () => {
  it("detects a newly added book", () => {
    expect(isBookListDifferent(toBookList(["old-1"]), toBookList(["new-1", "old-1"]))).toBe(true);
  });

  it("detects a removed book", () => {
    expect(isBookListDifferent(toBookList(["old-1", "old-2"]), toBookList(["old-1"]))).toBe(true);
  });

  it("detects when the book order changes", () => {
    expect(isBookListDifferent(toBookList(["old-1", "old-2"]), toBookList(["old-2", "old-1"]))).toBe(true);
  });

  it("returns false when both content and order are unchanged", () => {
    expect(isBookListDifferent(toBookList(["old-1", "old-2"]), toBookList(["old-1", "old-2"]))).toBe(false);
  });
});
