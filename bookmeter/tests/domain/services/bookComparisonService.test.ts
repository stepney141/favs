import { describe, it, expect } from "vitest";

import { BookListImpl, createBook } from "../../../domain/models/book";
import { BookComparisonService } from "../../../domain/services/bookComparisonService";

import type { BookId, ISBN10 } from "../../../domain/models/valueObjects";

// テスト用のヘルパー関数
function createTestId(id: string): BookId {
  return id as unknown as BookId;
}

function createTestIsbn(isbn: string): ISBN10 {
  return isbn as unknown as ISBN10;
}

describe("BookComparisonService", () => {
  // テスト用の書籍データを作成
  const book1 = createBook(
    createTestId("book-1"),
    "https://bookmeter.com/books/1",
    createTestIsbn("1234567890"),
    "テスト本1",
    "テスト著者1"
  );

  const book2 = createBook(
    createTestId("book-2"),
    "https://bookmeter.com/books/2",
    createTestIsbn("0987654321"),
    "テスト本2",
    "テスト著者2"
  );

  const book2Updated = createBook(
    createTestId("book-2"),
    "https://bookmeter.com/books/2",
    createTestIsbn("0987654321"),
    "テスト本2（改訂版）", // タイトルが変更されている
    "テスト著者2"
  );

  const book3 = createBook(
    createTestId("book-3"),
    "https://bookmeter.com/books/3",
    createTestIsbn("5555555555"),
    "テスト本3",
    "テスト著者3"
  );

  describe("compareBookLists", () => {
    it("追加された書籍を検出できる", () => {
      const oldList = BookListImpl.fromArray([book1], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");

      const diff = BookComparisonService.compareBookLists(oldList, newList);

      expect(diff.added.length).toBe(1);
      expect(diff.added[0].isbn).toBe(book2.isbn);
      expect(diff.removed.length).toBe(0);
      expect(diff.changed.length).toBe(0);
      expect(diff.unchanged.length).toBe(1);
    });

    it("削除された書籍を検出できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1], "wish");

      const diff = BookComparisonService.compareBookLists(oldList, newList);

      expect(diff.added.length).toBe(0);
      expect(diff.removed.length).toBe(1);
      expect(diff.removed[0].isbn).toBe(book2.isbn);
      expect(diff.changed.length).toBe(0);
      expect(diff.unchanged.length).toBe(1);
    });

    it("変更された書籍を検出できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated], "wish");

      const diff = BookComparisonService.compareBookLists(oldList, newList);

      expect(diff.added.length).toBe(0);
      expect(diff.removed.length).toBe(0);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].old.isbn).toBe(book2.isbn);
      expect(diff.changed[0].old.title).toBe("テスト本2");
      expect(diff.changed[0].new.title).toBe("テスト本2（改訂版）");
      expect(diff.unchanged.length).toBe(1);
    });

    it("複数の変更を検出できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book2Updated, book3], "wish");

      const diff = BookComparisonService.compareBookLists(oldList, newList);

      expect(diff.added.length).toBe(1);
      expect(diff.added[0].isbn).toBe(book3.isbn);
      expect(diff.removed.length).toBe(1);
      expect(diff.removed[0].isbn).toBe(book1.isbn);
      expect(diff.changed.length).toBe(1);
      expect(diff.changed[0].old.isbn).toBe(book2.isbn);
      expect(diff.unchanged.length).toBe(0);
    });
  });

  describe("hasChanges", () => {
    it("前回のリストがnullの場合は変更ありと判断", () => {
      const newList = BookListImpl.fromArray([book1], "wish");
      expect(BookComparisonService.hasChanges(null, newList)).toBe(true);
    });

    it("書籍数が異なる場合は変更ありと判断", () => {
      const oldList = BookListImpl.fromArray([book1], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");
      expect(BookComparisonService.hasChanges(oldList, newList)).toBe(true);
    });

    it("追加書籍がある場合は変更ありと判断", () => {
      const oldList = BookListImpl.fromArray([book1], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");
      expect(BookComparisonService.hasChanges(oldList, newList)).toBe(true);
    });

    it("削除書籍がある場合は変更ありと判断", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1], "wish");
      expect(BookComparisonService.hasChanges(oldList, newList)).toBe(true);
    });

    it("変更書籍がある場合は変更ありと判断", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated], "wish");
      expect(BookComparisonService.hasChanges(oldList, newList)).toBe(true);
    });

    it("変更がない場合は変更なしと判断", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");
      expect(BookComparisonService.hasChanges(oldList, newList)).toBe(false);
    });
  });

  describe("getDiffSummary", () => {
    it("書籍追加のサマリーを生成できる", () => {
      const oldList = BookListImpl.fromArray([book1], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");
      const diff = BookComparisonService.compareBookLists(oldList, newList);

      const summary = BookComparisonService.getDiffSummary(diff);
      expect(summary).toBe("1冊追加（合計2冊）");
    });

    it("書籍削除のサマリーを生成できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1], "wish");
      const diff = BookComparisonService.compareBookLists(oldList, newList);

      const summary = BookComparisonService.getDiffSummary(diff);
      expect(summary).toBe("1冊削除（合計2冊）");
    });

    it("書籍変更のサマリーを生成できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated], "wish");
      const diff = BookComparisonService.compareBookLists(oldList, newList);

      const summary = BookComparisonService.getDiffSummary(diff);
      expect(summary).toBe("1冊変更（合計2冊）");
    });

    it("複数の変更タイプがある場合のサマリーを生成できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated, book3], "wish");
      const diff = BookComparisonService.compareBookLists(oldList, newList);

      const summary = BookComparisonService.getDiffSummary(diff);
      expect(summary).toBe("1冊追加、1冊変更（合計3冊）");
    });

    it("変更がない場合のサマリーを生成できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");
      const diff = BookComparisonService.compareBookLists(oldList, newList);

      const summary = BookComparisonService.getDiffSummary(diff);
      expect(summary).toBe("変更なし");
    });
  });

  describe("getDiffDetails", () => {
    it("差分の詳細情報を取得できる", () => {
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated, book3], "wish");
      const diff = BookComparisonService.compareBookLists(oldList, newList);

      const details = BookComparisonService.getDiffDetails(diff);

      // 追加された書籍
      expect(details.added.length).toBe(1);
      expect(details.added[0].isbn).toBe(book3.isbn.toString());
      expect(details.added[0].title).toBe("テスト本3");

      // 削除された書籍
      expect(details.removed.length).toBe(0);

      // 変更された書籍
      expect(details.changed.length).toBe(1);
      expect(details.changed[0].isbn).toBe(book2.isbn.toString());
      expect(details.changed[0].oldTitle).toBe("テスト本2");
      expect(details.changed[0].newTitle).toBe("テスト本2（改訂版）");
    });
  });

  describe("mergeWithDiff", () => {
    it("ベースリストに差分を適用できる", () => {
      const baseList = BookListImpl.fromArray([book1, book2], "wish");

      // 以下の変更を含む差分を作成:
      // - book1を削除
      // - book2をbook2Updatedに更新
      // - book3を追加
      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book2Updated, book3], "wish");
      const diff = BookComparisonService.compareBookLists(oldList, newList);

      // 差分を適用
      const mergedList = BookComparisonService.mergeWithDiff(baseList, diff);

      // 結果の検証
      expect(mergedList.size()).toBe(2);

      // book1が削除されていることを確認
      const book1Result = mergedList.get(book1.isbn.toString());
      expect(book1Result._tag).toBe("None");

      // book2が更新されていることを確認
      const book2Result = mergedList.get(book2.isbn.toString());
      expect(book2Result._tag).toBe("Some");
      if (book2Result._tag === "Some") {
        // TypeScriptの型チェックを満足させるためにnon-null assertion operatorを使用
        expect(book2Result.value!.title).toBe("テスト本2（改訂版）");
      }

      // book3が追加されていることを確認
      const book3Result = mergedList.get(book3.isbn.toString());
      expect(book3Result._tag).toBe("Some");
    });
  });
});
