import { describe, it, expect } from "vitest";

import {
  createBook,
  updateBook,
  setPublisher,
  setPublishedDate,
  setDescription,
  setTableOfContents,
  addLibraryAvailability,
  BookListImpl,
  diffBookLists
} from "../../../domain/models/book";
import { fromNullable, isSome } from "../../../domain/models/option";

import type { Book } from "../../../domain/models/book";
import type { BookId, ISBN10, LibraryId, ASIN } from "../../../domain/models/valueObjects";

// テスト用のモックデータ
const mockBookId = "book-1" as unknown as BookId; // Brandタイプのモック
const mockLibraryId = "library-1" as unknown as LibraryId; // Brandタイプのモック
const mockIsbn = "1234567890" as unknown as ISBN10; // Brandタイプのモック

// テスト用のヘルパー関数
function createTestBookId(id: string): BookId {
  return id as unknown as BookId;
}

function createTestIsbn(isbn: string): ISBN10 | ASIN {
  return isbn as unknown as ISBN10;
}

// sortがreadonly string[]で使えない問題に対応
function sortedArray<T>(array: readonly T[]): T[] {
  return [...array].sort();
}

describe("Book関連の関数", () => {
  describe("createBook", () => {
    it("基本的なプロパティを持つBookを作成できる", () => {
      const book = createBook(mockBookId, "https://bookmeter.com/books/123", mockIsbn, "テスト本", "テスト著者");

      expect(book.id).toBe(mockBookId);
      expect(book.bookmeterUrl).toBe("https://bookmeter.com/books/123");
      expect(book.isbn).toBe(mockIsbn);
      expect(book.title).toBe("テスト本");
      expect(book.author).toBe("テスト著者");
      expect(isSome(book.publisher)).toBe(false);
      expect(isSome(book.publishedDate)).toBe(false);
      expect(isSome(book.description)).toBe(false);
      expect(isSome(book.tableOfContents)).toBe(false);
      expect(book.libraryAvailability.size).toBe(0);
    });

    it("オプショナルなプロパティを含めてBookを作成できる", () => {
      const book = createBook(
        mockBookId,
        "https://bookmeter.com/books/123",
        mockIsbn,
        "テスト本",
        "テスト著者",
        "出版社",
        "2025-05-01",
        "これはテスト本です",
        "第1章: はじめに",
        new Map([[mockLibraryId, { isAvailable: true, opacUrl: fromNullable("https://library.example.com") }]])
      );

      expect(book.id).toBe(mockBookId);
      expect(book.title).toBe("テスト本");
      expect(isSome(book.publisher)).toBe(true);
      if (isSome(book.publisher)) expect(book.publisher.value).toBe("出版社");
      expect(isSome(book.publishedDate)).toBe(true);
      if (isSome(book.publishedDate)) expect(book.publishedDate.value).toBe("2025-05-01");
      expect(isSome(book.description)).toBe(true);
      if (isSome(book.description)) expect(book.description.value).toBe("これはテスト本です");
      expect(isSome(book.tableOfContents)).toBe(true);
      if (isSome(book.tableOfContents)) expect(book.tableOfContents.value).toBe("第1章: はじめに");
      expect(book.libraryAvailability.size).toBe(1);
      const libAvail = book.libraryAvailability.get(mockLibraryId);
      expect(libAvail).toBeDefined();
      if (libAvail) {
        expect(libAvail.isAvailable).toBe(true);
        expect(isSome(libAvail.opacUrl)).toBe(true);
        if (isSome(libAvail.opacUrl)) expect(libAvail.opacUrl.value).toBe("https://library.example.com");
      }
    });

    it("nullやundefinedをOption.noneに変換する", () => {
      const bookWithNull = createBook(
        mockBookId,
        "https://bookmeter.com/books/123",
        mockIsbn,
        "テスト本",
        "テスト著者",
        null,
        undefined
      );

      expect(isSome(bookWithNull.publisher)).toBe(false);
      expect(isSome(bookWithNull.publishedDate)).toBe(false);
    });
  });

  describe("更新関数", () => {
    it("updateBookで複数のプロパティを一度に更新できる", () => {
      const book = createBook(mockBookId, "https://bookmeter.com/books/123", mockIsbn, "テスト本", "テスト著者");

      const updatedBook = updateBook(book, {
        title: "更新されたタイトル",
        author: "更新された著者",
        publisher: fromNullable("更新された出版社")
      });

      expect(updatedBook.id).toBe(book.id); // 変更されない
      expect(updatedBook.isbn).toBe(book.isbn); // 変更されない
      expect(updatedBook.bookmeterUrl).toBe(book.bookmeterUrl); // 変更されない
      expect(updatedBook.title).toBe("更新されたタイトル");
      expect(updatedBook.author).toBe("更新された著者");
      expect(isSome(updatedBook.publisher)).toBe(true);
      if (isSome(updatedBook.publisher)) {
        expect(updatedBook.publisher.value).toBe("更新された出版社");
      }
    });

    it("setPublisherで出版社を設定できる", () => {
      const book = createBook(mockBookId, "https://bookmeter.com/books/123", mockIsbn, "テスト本", "テスト著者");

      const updated = setPublisher(book, "新しい出版社");
      expect(isSome(updated.publisher)).toBe(true);
      if (isSome(updated.publisher)) {
        expect(updated.publisher.value).toBe("新しい出版社");
      }

      // nullを渡すとnoneになる
      const cleared = setPublisher(updated, null);
      expect(isSome(cleared.publisher)).toBe(false);
    });

    it("setPublishedDateで出版日を設定できる", () => {
      const book = createBook(mockBookId, "https://bookmeter.com/books/123", mockIsbn, "テスト本", "テスト著者");

      const updated = setPublishedDate(book, "2025-05-01");
      expect(isSome(updated.publishedDate)).toBe(true);
      if (isSome(updated.publishedDate)) {
        expect(updated.publishedDate.value).toBe("2025-05-01");
      }
    });

    it("setDescriptionで説明を設定できる", () => {
      const book = createBook(mockBookId, "https://bookmeter.com/books/123", mockIsbn, "テスト本", "テスト著者");

      const updated = setDescription(book, "テスト説明");
      expect(isSome(updated.description)).toBe(true);
      if (isSome(updated.description)) {
        expect(updated.description.value).toBe("テスト説明");
      }
    });

    it("setTableOfContentsで目次を設定できる", () => {
      const book = createBook(mockBookId, "https://bookmeter.com/books/123", mockIsbn, "テスト本", "テスト著者");

      const updated = setTableOfContents(book, "第1章: テスト");
      expect(isSome(updated.tableOfContents)).toBe(true);
      if (isSome(updated.tableOfContents)) {
        expect(updated.tableOfContents.value).toBe("第1章: テスト");
      }
    });

    it("addLibraryAvailabilityで図書館の情報を追加できる", () => {
      const book = createBook(mockBookId, "https://bookmeter.com/books/123", mockIsbn, "テスト本", "テスト著者");

      const updated = addLibraryAvailability(book, mockLibraryId, true, "https://library.example.com");

      expect(updated.libraryAvailability.size).toBe(1);
      const libAvail = updated.libraryAvailability.get(mockLibraryId);
      expect(libAvail).toBeDefined();
      if (libAvail) {
        expect(libAvail.isAvailable).toBe(true);
        expect(isSome(libAvail.opacUrl)).toBe(true);
        if (isSome(libAvail.opacUrl)) {
          expect(libAvail.opacUrl.value).toBe("https://library.example.com");
        }
      }
    });
  });
});

describe("BookList", () => {
  describe("BookListImpl", () => {
    it("createEmptyで空のリストを作成できる", () => {
      const emptyList = BookListImpl.createEmpty("wish");
      expect(emptyList.size()).toBe(0);
      expect(emptyList.type).toBe("wish");
      expect(emptyList.getIsbns()).toEqual([]);
    });

    it("fromMapでMapから書籍リストを作成できる", () => {
      const book1 = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本1",
        "テスト著者1"
      );
      const book2 = createBook(
        "book-2" as any,
        "https://bookmeter.com/books/2",
        "0987654321" as any,
        "テスト本2",
        "テスト著者2"
      );

      const map = new Map<string, Book>([
        ["1234567890", book1],
        ["0987654321", book2]
      ]);

      const bookList = BookListImpl.fromMap(map, "stacked");
      expect(bookList.size()).toBe(2);
      expect(bookList.type).toBe("stacked");
      expect([...bookList.getIsbns()].sort()).toEqual(["0987654321", "1234567890"].sort());
    });

    it("fromArrayで配列から書籍リストを作成できる", () => {
      const book1 = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本1",
        "テスト著者1"
      );
      const book2 = createBook(
        "book-2" as any,
        "https://bookmeter.com/books/2",
        "0987654321" as any,
        "テスト本2",
        "テスト著者2"
      );

      const bookList = BookListImpl.fromArray([book1, book2], "wish");
      expect(bookList.size()).toBe(2);
      expect(bookList.type).toBe("wish");
      // ISBNをキーとして使用していることを確認
      expect([...bookList.getIsbns()].sort()).toEqual(["0987654321", "1234567890"].sort());
    });

    it("addで書籍を追加できる", () => {
      const bookList = BookListImpl.createEmpty("wish");
      const book = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本",
        "テスト著者"
      );

      const updatedList = bookList.add(book);
      // 不変性を守っていることを確認
      expect(bookList.size()).toBe(0);
      expect(updatedList.size()).toBe(1);
      expect(updatedList.getIsbns()).toEqual(["1234567890"]);
    });

    it("removeで書籍を削除できる", () => {
      const book = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本",
        "テスト著者"
      );
      const bookList = BookListImpl.fromArray([book], "wish");

      const updatedList = bookList.remove("1234567890");
      // 不変性を守っていることを確認
      expect(bookList.size()).toBe(1);
      expect(updatedList.size()).toBe(0);
    });

    it("getで書籍を取得できる", () => {
      const book = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本",
        "テスト著者"
      );
      const bookList = BookListImpl.fromArray([book], "wish");

      const result = bookList.get("1234567890");
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value.title).toBe("テスト本");
      }

      // 存在しないISBNの場合
      const notFoundResult = bookList.get("9999999999");
      expect(isSome(notFoundResult)).toBe(false);
    });

    it("mapで書籍リストを変換できる", () => {
      const book1 = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本1",
        "テスト著者1"
      );
      const book2 = createBook(
        "book-2" as any,
        "https://bookmeter.com/books/2",
        "0987654321" as any,
        "テスト本2",
        "テスト著者2"
      );

      const bookList = BookListImpl.fromArray([book1, book2], "wish");
      const updatedList = bookList.map((book) => ({
        ...book,
        title: `変換: ${book.title}`
      }));

      // 不変性を守っていることを確認
      expect(bookList.get("1234567890")?.value?.title).toBe("テスト本1");

      const book1Result = updatedList.get("1234567890");
      expect(isSome(book1Result)).toBe(true);
      if (isSome(book1Result)) {
        expect(book1Result.value.title).toBe("変換: テスト本1");
      }

      const book2Result = updatedList.get("0987654321");
      expect(isSome(book2Result)).toBe(true);
      if (isSome(book2Result)) {
        expect(book2Result.value.title).toBe("変換: テスト本2");
      }
    });

    it("filterで条件に合う書籍のみを抽出できる", () => {
      const book1 = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本1",
        "テスト著者1"
      );
      const book2 = createBook(
        "book-2" as any,
        "https://bookmeter.com/books/2",
        "0987654321" as any,
        "テスト本2",
        "テスト著者2"
      );

      const bookList = BookListImpl.fromArray([book1, book2], "wish");
      const filteredList = bookList.filter((book) => book.title === "テスト本1");

      // 不変性を守っていることを確認
      expect(bookList.size()).toBe(2);
      expect(filteredList.size()).toBe(1);
      expect(filteredList.getIsbns()).toEqual(["1234567890"]);
    });

    it("iterableプロトコルをサポートしている", () => {
      const book1 = createBook(
        "book-1" as any,
        "https://bookmeter.com/books/1",
        "1234567890" as any,
        "テスト本1",
        "テスト著者1"
      );
      const book2 = createBook(
        "book-2" as any,
        "https://bookmeter.com/books/2",
        "0987654321" as any,
        "テスト本2",
        "テスト著者2"
      );

      const bookList = BookListImpl.fromArray([book1, book2], "wish");
      const entries: [string, Book][] = [];

      // for...ofでイテレーションできることを確認
      for (const [isbn, book] of bookList) {
        entries.push([isbn, book]);
      }

      expect(entries.length).toBe(2);
      // ISBNでソートして順序を固定
      const sortedEntries = entries.sort((a, b) => a[0].localeCompare(b[0]));
      expect(sortedEntries[0][0]).toBe("0987654321");
      expect(sortedEntries[0][1].title).toBe("テスト本2");
      expect(sortedEntries[1][0]).toBe("1234567890");
      expect(sortedEntries[1][1].title).toBe("テスト本1");
    });
  });

  describe("diffBookLists", () => {
    it("2つの書籍リストの差分を計算できる", () => {
      // 共通の書籍
      const commonBook = createBook(
        "common" as any,
        "https://bookmeter.com/books/common",
        "common123" as any,
        "共通の本",
        "著者"
      );

      // 古いリストにのみ存在する書籍
      const removedBook = createBook(
        "removed" as any,
        "https://bookmeter.com/books/removed",
        "removed123" as any,
        "削除された本",
        "著者"
      );

      // 新しいリストにのみ存在する書籍
      const addedBook = createBook(
        "added" as any,
        "https://bookmeter.com/books/added",
        "added123" as any,
        "追加された本",
        "著者"
      );

      // 変更された書籍（古いバージョン）
      const oldChangedBook = createBook(
        "changed" as any,
        "https://bookmeter.com/books/changed",
        "changed123" as any,
        "古いタイトル",
        "古い著者"
      );

      // 変更された書籍（新しいバージョン）
      const newChangedBook = createBook(
        "changed" as any,
        "https://bookmeter.com/books/changed",
        "changed123" as any,
        "新しいタイトル", // タイトルが変更された
        "新しい著者" // 著者が変更された
      );

      // 古いリスト
      const oldList = BookListImpl.fromArray([commonBook, removedBook, oldChangedBook], "wish");

      // 新しいリスト
      const newList = BookListImpl.fromArray([commonBook, addedBook, newChangedBook], "wish");

      // 差分を計算
      const diff = diffBookLists(oldList, newList);

      // 追加された書籍
      expect(diff.added.length).toBe(1);
      expect(diff.added[0].title).toBe("追加された本");

      // 削除された書籍
      expect(diff.removed.length).toBe(1);
      expect(diff.removed[0].title).toBe("削除された本");

      // 変更された書籍
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].old.title).toBe("古いタイトル");
      expect(diff.changed[0].old.author).toBe("古い著者");
      expect(diff.changed[0].new.title).toBe("新しいタイトル");
      expect(diff.changed[0].new.author).toBe("新しい著者");

      // 変更されていない書籍
      expect(diff.unchanged.length).toBe(1);
      expect(diff.unchanged[0].title).toBe("共通の本");
    });
  });
});
