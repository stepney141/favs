import type { Book, ISBN10, BookList } from "./types";

export function makeEmptyBook(isbn: ISBN10): Book {
  return {
    bookmeter_url: "",
    isbn_or_asin: isbn,
    book_title: "",
    author: "",
    publisher: "",
    published_date: "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    sophia_opac: "",
    utokyo_opac: "",
    sophia_mathlib_opac: "",
    description: ""
  };
}

export type BookListDiff = {
  removed: Book[];
  unchanged: Book[];
  added: Book[];
};

/**
 * Compare two book lists and categorize entries by membership.
 * Pure function without side effects so that it can be reused in different layers.
 */
export function diffBookLists(previous: BookList, latest: BookList): BookListDiff {
  const previousIds = new Set(previous.keys());
  const latestIds = new Set(latest.keys());

  const removed = [...previousIds.difference(latestIds)].map((id) => previous.get(id)!);
  const unchanged = [...previousIds.intersection(latestIds)].map((id) => latest.get(id)!);
  const added = [...latestIds.difference(previousIds)].map((id) => latest.get(id)!);

  return { removed, unchanged, added };
}
