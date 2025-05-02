import { describe, it, expect } from "vitest";

import {
  CompareBookListsUseCase,
  HasBookListChangesUseCase
} from "../../../application/usecases/compareBookListsUseCase";
import { BookListImpl, createBook } from "../../../domain/models/book";
import { isRight, isLeft } from "../../../domain/models/either";

import type { BookId, ISBN10 } from "../../../domain/models/valueObjects";

// テスト用のヘルパー関数
function createTestId(id: string): BookId {
  return id as unknown as BookId;
}

function createTestIsbn(isbn: string): ISBN10 {
  return isbn as unknown as ISBN10;
}

describe("CompareBookListsUseCase", () => {
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

  describe("CompareBookListsUseCase.execute", () => {
    it("2つの書籍リストを比較して差分情報を返す", async () => {
      const useCase = new CompareBookListsUseCase();

      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated, book3], "wish");

      const result = await useCase.execute({
        oldList,
        newList,
        includeDetails: true
      });

      expect(isRight(result)).toBe(true);

      if (isRight(result)) {
        const output = result.right;

        // 差分情報が正しいことを確認
        expect(output.hasChanges).toBe(true);
        expect(output.summary).toBe("1冊追加、1冊変更（合計3冊）");

        // 差分の詳細情報が含まれていることを確認
        expect(output.details).toBeDefined();
        if (output.details) {
          expect(output.details.added.length).toBe(1);
          expect(output.details.added[0].isbn).toBe(book3.isbn.toString());
          expect(output.details.added[0].title).toBe("テスト本3");

          expect(output.details.changed.length).toBe(1);
          expect(output.details.changed[0].isbn).toBe(book2.isbn.toString());
          expect(output.details.changed[0].oldTitle).toBe("テスト本2");
          expect(output.details.changed[0].newTitle).toBe("テスト本2（改訂版）");
        }
      }
    });

    it("詳細情報なしで差分情報を取得できる", async () => {
      const useCase = new CompareBookListsUseCase();

      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated, book3], "wish");

      const result = await useCase.execute({
        oldList,
        newList,
        includeDetails: false
      });

      expect(isRight(result)).toBe(true);

      if (isRight(result)) {
        const output = result.right;

        // 差分情報が正しいことを確認
        expect(output.hasChanges).toBe(true);
        expect(output.summary).toBe("1冊追加、1冊変更（合計3冊）");

        // 詳細情報が含まれていないことを確認
        expect(output.details).toBeUndefined();
      }
    });

    it("変更がない場合も正しく結果を返す", async () => {
      const useCase = new CompareBookListsUseCase();

      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");

      const result = await useCase.execute({
        oldList,
        newList
      });

      expect(isRight(result)).toBe(true);

      if (isRight(result)) {
        const output = result.right;

        // 変更がないことを確認
        expect(output.hasChanges).toBe(false);
        expect(output.summary).toBe("変更なし");
      }
    });

    it("エラーが発生した場合はEitherのLeftを返す", async () => {
      const useCase = new CompareBookListsUseCase();

      // 無効な入力を渡してエラーを発生させる
      const invalidList = null as unknown as BookListImpl;

      const result = await useCase.execute({
        oldList: invalidList,
        newList: invalidList
      });

      expect(isLeft(result)).toBe(true);

      if (isLeft(result)) {
        expect(result.left.code).toBe("COMPARISON_ERROR");
        expect(result.left.message).toBe("書籍リストの比較中にエラーが発生しました");
      }
    });
  });
});

describe("HasBookListChangesUseCase", () => {
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

  describe("HasBookListChangesUseCase.execute", () => {
    it("変更がある場合はtrueを返す", async () => {
      const useCase = new HasBookListChangesUseCase();

      const oldList = BookListImpl.fromArray([book1], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");

      const result = await useCase.execute({
        oldList,
        newList
      });

      expect(isRight(result)).toBe(true);
      if (isRight(result)) {
        expect(result.right).toBe(true);
      }
    });

    it("変更がない場合はfalseを返す", async () => {
      const useCase = new HasBookListChangesUseCase();

      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2], "wish");

      const result = await useCase.execute({
        oldList,
        newList
      });

      expect(isRight(result)).toBe(true);
      if (isRight(result)) {
        expect(result.right).toBe(false);
      }
    });

    it("タイトルが変更された場合は変更ありと判定する", async () => {
      const useCase = new HasBookListChangesUseCase();

      const oldList = BookListImpl.fromArray([book1, book2], "wish");
      const newList = BookListImpl.fromArray([book1, book2Updated], "wish");

      const result = await useCase.execute({
        oldList,
        newList
      });

      expect(isRight(result)).toBe(true);
      if (isRight(result)) {
        expect(result.right).toBe(true);
      }
    });

    it("エラーが発生した場合はEitherのLeftを返す", async () => {
      const useCase = new HasBookListChangesUseCase();

      // 無効な入力を渡してエラーを発生させる
      const invalidList = null as unknown as BookListImpl;

      const result = await useCase.execute({
        oldList: invalidList,
        newList: invalidList
      });

      expect(isLeft(result)).toBe(true);

      if (isLeft(result)) {
        expect(result.left.code).toBe("VALIDATION_ERROR");
        expect(result.left.message).toBe("書籍リストの変更検出中にエラーが発生しました");
      }
    });
  });
});
