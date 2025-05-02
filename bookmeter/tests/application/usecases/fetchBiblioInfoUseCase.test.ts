import { describe, it, expect, vi } from "vitest";

import {
  FetchBookBiblioInfoUseCase,
  FetchBookListBiblioInfoUseCase
} from "../../../application/usecases/fetchBiblioInfoUseCase";
import { BookListImpl, createBook } from "../../../domain/models/book";
import { right, left, isRight, isLeft } from "../../../domain/models/either";

import type {
  BiblioInfoProviderAggregator,
  BiblioInfoError
} from "../../../application/ports/output/biblioInfoProvider";
import type { BookId, ISBN10 } from "../../../domain/models/valueObjects";

// テスト用のヘルパー関数
function createTestId(id: string): BookId {
  return id as unknown as BookId;
}

function createTestIsbn(isbn: string): ISBN10 {
  return isbn as unknown as ISBN10;
}

// モック用のBiblioInfoProviderAggregatorを作成
function createMockBiblioInfoAggregator(): BiblioInfoProviderAggregator {
  const enrichBook = vi.fn();
  const enrichBooks = vi.fn();
  const registerProvider = vi.fn();

  return {
    enrichBook,
    enrichBooks,
    registerProvider
  } as unknown as BiblioInfoProviderAggregator;
}

describe("FetchBookBiblioInfoUseCase", () => {
  // テスト用の書籍データを作成
  const book = createBook(
    createTestId("book-1"),
    "https://bookmeter.com/books/1",
    createTestIsbn("1234567890"),
    "テスト本", // タイトル不完全
    "", // 著者情報なし
    null, // 出版社情報なし
    null // 出版日情報なし
  );

  // 書誌情報が充実した書籍
  const enrichedBook = createBook(
    createTestId("book-1"),
    "https://bookmeter.com/books/1",
    createTestIsbn("1234567890"),
    "テスト本（完全版）",
    "テスト著者",
    "テスト出版社",
    "2025-01-01"
  );

  describe("execute", () => {
    it("書誌情報プロバイダから情報を取得して書籍情報を充実させる", async () => {
      // モックをセットアップ
      const mockAggregator = createMockBiblioInfoAggregator();
      vi.mocked(mockAggregator.enrichBook).mockResolvedValue(right(enrichedBook));

      const useCase = new FetchBookBiblioInfoUseCase(mockAggregator);

      // 実行
      const result = await useCase.execute({
        book,
        apiKeys: { openbd: "test-key" }
      });

      // 検証
      expect(isRight(result)).toBe(true);
      expect(mockAggregator.enrichBook).toHaveBeenCalledWith(book, { openbd: "test-key" });

      if (isRight(result)) {
        const resultBook = result.right;
        expect(resultBook.title).toBe("テスト本（完全版）");
        expect(resultBook.author).toBe("テスト著者");
        expect(resultBook.publisher._tag).toBe("Some");
        if (resultBook.publisher._tag === "Some") {
          expect(resultBook.publisher.value).toBe("テスト出版社");
        }
        expect(resultBook.publishedDate._tag).toBe("Some");
        if (resultBook.publishedDate._tag === "Some") {
          expect(resultBook.publishedDate.value).toBe("2025-01-01");
        }
      }
    });

    it("プロバイダからエラーが返された場合、エラーを適切に処理する", async () => {
      // モックをセットアップ
      const mockAggregator = createMockBiblioInfoAggregator();
      const apiError: BiblioInfoError = {
        code: "API_ERROR",
        message: "Failed to fetch bibliographic information",
        cause: new Error("Network error")
      };

      vi.mocked(mockAggregator.enrichBook).mockResolvedValue(left(apiError));

      const useCase = new FetchBookBiblioInfoUseCase(mockAggregator);

      // 実行
      const result = await useCase.execute({ book });

      // 検証
      expect(isLeft(result)).toBe(true);
      expect(mockAggregator.enrichBook).toHaveBeenCalledWith(book, undefined);

      if (isLeft(result)) {
        expect(result.left.code).toBe("PROVIDER_ERROR");
        expect(result.left.message).toContain("書誌情報の取得に失敗しました");
        expect(result.left.cause).toBe(apiError);
      }
    });

    it("予期しないエラーが発生した場合、適切に処理する", async () => {
      // モックをセットアップ
      const mockAggregator = createMockBiblioInfoAggregator();
      const unexpectedError = new Error("Unexpected error");

      vi.mocked(mockAggregator.enrichBook).mockRejectedValue(unexpectedError);

      const useCase = new FetchBookBiblioInfoUseCase(mockAggregator);

      // 実行
      const result = await useCase.execute({ book });

      // 検証
      expect(isLeft(result)).toBe(true);
      expect(mockAggregator.enrichBook).toHaveBeenCalledWith(book, undefined);

      if (isLeft(result)) {
        expect(result.left.code).toBe("VALIDATION_ERROR");
        expect(result.left.message).toContain("書誌情報取得処理中にエラーが発生しました");
        expect(result.left.cause).toBe(unexpectedError);
      }
    });
  });
});

describe("FetchBookListBiblioInfoUseCase", () => {
  // テスト用の書籍データを作成
  const book1 = createBook(
    createTestId("book-1"),
    "https://bookmeter.com/books/1",
    createTestIsbn("1234567890"),
    "", // タイトル情報なし
    "", // 著者情報なし
    null, // 出版社情報なし
    null // 出版日情報なし
  );

  const book2 = createBook(
    createTestId("book-2"),
    "https://bookmeter.com/books/2",
    createTestIsbn("0987654321"),
    "テスト本2", // タイトル情報あり
    "テスト著者2", // 著者情報あり
    "テスト出版社2", // 出版社情報あり
    "2025-02-02" // 出版日情報あり
  );

  const book3 = createBook(
    createTestId("book-3"),
    "https://bookmeter.com/books/3",
    createTestIsbn("5555555555"),
    "テスト本3", // タイトル情報あり
    "", // 著者情報なし
    null, // 出版社情報なし
    "2025-03-03" // 出版日情報あり
  );

  // 書誌情報が充実した書籍
  const enrichedBook1 = createBook(
    createTestId("book-1"),
    "https://bookmeter.com/books/1",
    createTestIsbn("1234567890"),
    "テスト本1（完全版）",
    "テスト著者1",
    "テスト出版社1",
    "2025-01-01"
  );

  const enrichedBook3 = createBook(
    createTestId("book-3"),
    "https://bookmeter.com/books/3",
    createTestIsbn("5555555555"),
    "テスト本3（完全版）",
    "テスト著者3",
    "テスト出版社3",
    "2025-03-03"
  );

  describe("execute", () => {
    it("書籍リストのすべての書籍の書誌情報を取得する", async () => {
      // モックをセットアップ
      const mockAggregator = createMockBiblioInfoAggregator();
      const bookList = BookListImpl.fromArray([book1, book2, book3], "wish");

      vi.mocked(mockAggregator.enrichBooks).mockResolvedValue(right([enrichedBook1, book2, enrichedBook3]));

      const useCase = new FetchBookListBiblioInfoUseCase(mockAggregator);

      // 実行
      const result = await useCase.execute({
        bookList,
        apiKeys: { openbd: "test-key" }
      });

      // 検証
      expect(isRight(result)).toBe(true);
      expect(mockAggregator.enrichBooks).toHaveBeenCalledWith(expect.arrayContaining([book1, book2, book3]), {
        openbd: "test-key"
      });

      if (isRight(result)) {
        const resultList = result.right;
        expect(resultList.size()).toBe(3);

        const resultBook1 = resultList.get(book1.isbn.toString());
        expect(resultBook1._tag).toBe("Some");
        if (resultBook1._tag === "Some") {
          expect(resultBook1.value.title).toBe("テスト本1（完全版）");
        }

        const resultBook3 = resultList.get(book3.isbn.toString());
        expect(resultBook3._tag).toBe("Some");
        if (resultBook3._tag === "Some") {
          expect(resultBook3.value.title).toBe("テスト本3（完全版）");
        }
      }
    });

    it("既に情報がある書籍はスキップする", async () => {
      // モックをセットアップ
      const mockAggregator = createMockBiblioInfoAggregator();
      const bookList = BookListImpl.fromArray([book1, book2, book3], "wish");

      vi.mocked(mockAggregator.enrichBooks).mockResolvedValue(right([enrichedBook1, enrichedBook3]));

      const useCase = new FetchBookListBiblioInfoUseCase(mockAggregator);

      // 実行
      const result = await useCase.execute({
        bookList,
        apiKeys: { openbd: "test-key" },
        skipExistingInfo: true
      });

      // 検証
      expect(isRight(result)).toBe(true);

      // book2は既に情報があるのでスキップされるはず
      expect(mockAggregator.enrichBooks).toHaveBeenCalledWith(expect.arrayContaining([book1, book3]), {
        openbd: "test-key"
      });

      if (isRight(result)) {
        const resultList = result.right;
        expect(resultList.size()).toBe(3); // 全書籍が含まれる

        // book2は元の情報のまま
        const resultBook2 = resultList.get(book2.isbn.toString());
        expect(resultBook2._tag).toBe("Some");
        if (resultBook2._tag === "Some") {
          expect(resultBook2.value.title).toBe("テスト本2");
          expect(resultBook2.value.author).toBe("テスト著者2");
        }
      }
    });

    it("プロバイダからエラーが返された場合、エラーを適切に処理する", async () => {
      // モックをセットアップ
      const mockAggregator = createMockBiblioInfoAggregator();
      const bookList = BookListImpl.fromArray([book1, book2, book3], "wish");

      const apiError: BiblioInfoError = {
        code: "API_ERROR",
        message: "Failed to fetch bibliographic information",
        cause: new Error("Network error")
      };

      vi.mocked(mockAggregator.enrichBooks).mockResolvedValue(left(apiError));

      const useCase = new FetchBookListBiblioInfoUseCase(mockAggregator);

      // 実行
      const result = await useCase.execute({ bookList });

      // 検証
      expect(isLeft(result)).toBe(true);
      expect(mockAggregator.enrichBooks).toHaveBeenCalledWith(expect.arrayContaining([book1, book2, book3]), undefined);

      if (isLeft(result)) {
        expect(result.left.code).toBe("PROVIDER_ERROR");
        expect(result.left.message).toContain("書誌情報の一括取得に失敗しました");
        expect(result.left.cause).toBe(apiError);
      }
    });

    it("予期しないエラーが発生した場合、適切に処理する", async () => {
      // モックをセットアップ
      const mockAggregator = createMockBiblioInfoAggregator();
      const bookList = BookListImpl.fromArray([book1, book2, book3], "wish");

      const unexpectedError = new Error("Unexpected error");
      vi.mocked(mockAggregator.enrichBooks).mockRejectedValue(unexpectedError);

      const useCase = new FetchBookListBiblioInfoUseCase(mockAggregator);

      // 実行
      const result = await useCase.execute({ bookList });

      // 検証
      expect(isLeft(result)).toBe(true);

      if (isLeft(result)) {
        expect(result.left.code).toBe("VALIDATION_ERROR");
        expect(result.left.message).toContain("書誌情報の一括取得処理中にエラーが発生しました");
        expect(result.left.cause).toBe(unexpectedError);
      }
    });
  });
});
