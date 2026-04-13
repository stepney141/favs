import { describe, expect, it } from "vitest";

import { hasCompleteCachedBiblio, shouldFetchBibliographicData, shouldFetchLibraryHoldings } from "./cachePolicy";

import type { Book } from "../domain/book";
import type { ISBN10 } from "../domain/isbn";

const makeBook = (overrides: Partial<Book> = {}): Book => {
  return {
    author: "Ada Lovelace",
    book_title: "Computing Machinery",
    bookmeter_url: "https://bookmeter.com/books/1",
    description: "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    isbn_or_asin: "4000000000" as ISBN10,
    published_date: "2024-01-01",
    publisher: "Example Press",
    sophia_mathlib_opac: "",
    sophia_opac: "",
    utokyo_opac: "",
    ...overrides
  };
};

describe("hasCompleteCachedBiblio", () => {
  it("accepts a fully populated cached book", () => {
    expect(hasCompleteCachedBiblio(makeBook())).toBe(true);
  });

  it("rejects placeholder values from failed lookups", () => {
    expect(hasCompleteCachedBiblio(makeBook({ published_date: "Not_found_in_NDL" }))).toBe(false);
    expect(hasCompleteCachedBiblio(makeBook({ author: "GoogleBooks_API_Error" }))).toBe(false);
  });

  it("rejects empty fields", () => {
    expect(hasCompleteCachedBiblio(makeBook({ publisher: "" }))).toBe(false);
  });

  it("rejects stringified object values from previous API parsing", () => {
    expect(hasCompleteCachedBiblio(makeBook({ publisher: "[object Object]" }))).toBe(false);
    expect(hasCompleteCachedBiblio(makeBook({ publisher: " [object Object] " }))).toBe(false);
  });
});

describe("shouldFetchBibliographicData", () => {
  it("skips API fetches when complete cached data exists", () => {
    expect(shouldFetchBibliographicData(makeBook(), false)).toBe(false);
  });

  it("forces API fetches when requested", () => {
    expect(shouldFetchBibliographicData(makeBook(), true)).toBe(true);
  });
});

describe("shouldFetchLibraryHoldings", () => {
  it("skips holdings lookup for cached books unless force is enabled", () => {
    const cachedBookUrls = new Set(["https://bookmeter.com/books/1"]);
    expect(shouldFetchLibraryHoldings(makeBook(), false, cachedBookUrls)).toBe(false);
    expect(shouldFetchLibraryHoldings(makeBook(), true, cachedBookUrls)).toBe(true);
  });

  it("fetches holdings for uncached books", () => {
    expect(shouldFetchLibraryHoldings(makeBook(), false, new Set())).toBe(true);
  });
});
