import { describe, it, expect, vi } from "vitest";

import { GetBookListWithParamsUseCase } from "../../../application/usecases/getBookListUseCase";
import { BookListImpl, createBook } from "../../../domain/models/book";
import { right, left, isRight, isLeft } from "../../../domain/models/either";

import type { BookRepository } from "../../../application/ports/output/bookRepository";
import type { BookScraperService } from "../../../application/ports/output/bookScraperService";
import type { BookId, ISBN10, UserId } from "../../../domain/models/valueObjects";

// モック用のヘルパー関数
function createTestId(id: string): BookId {
  return id as unknown as BookId;
}

function createTestIsbn(isbn: string): ISBN10 {
  return isbn as unknown as ISBN10;
}

function createTestUserId(id: string): UserId {
  return id as unknown as UserId;
}

// モックリポジトリの作成
function createMockRepository() {
  // vi.fnで明示的に型指定してモック関数を作成
  const getBookList = vi.fn();
  const saveBookList = vi.fn();
  const getBook = vi.fn();
  const saveBook = vi.fn();
  const deleteBook = vi.fn();
  const exportToCsv = vi.fn();
  const importFromCsv = vi.fn();
  const initializeDatabase = vi.fn();
  const updateDescription = vi.fn();
  const backupDatabase = vi.fn();
  const restoreDatabase = vi.fn();

  return {
    getBookList,
    saveBookList,
    getBook,
    saveBook,
    deleteBook,
    exportToCsv,
    importFromCsv,
    initializeDatabase,
    updateDescription,
    backupDatabase,
    restoreDatabase
  } as unknown as BookRepository;
}

// モックスクレイパーの作成
function createMockScraper() {
  const getWishBooks = vi.fn();
  const getStackedBooks = vi.fn();

  return {
    getWishBooks,
    getStackedBooks
  } as unknown as BookScraperService;
}

describe("GetBookListWithParamsUseCase", () => {
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

  const mockUserId = createTestUserId("user-1");

  describe("execute", () => {
    it("ローカルリポジトリに書籍リストが存在する場合、リモートから取得しない", async () => {
      // モックをセットアップ
      const mockRepository = createMockRepository();
      const mockScraper = createMockScraper();

      const localBookList = BookListImpl.fromArray([book1, book2], "wish");

      // リポジトリがデータを返すように設定
      vi.mocked(mockRepository.getBookList).mockResolvedValue(right(localBookList));

      const useCase = new GetBookListWithParamsUseCase(mockRepository, mockScraper);

      // 実行
      const result = await useCase.execute({
        userId: mockUserId,
        type: "wish",
        forceRemote: false
      });

      // 検証
      expect(isRight(result)).toBe(true);
      expect(mockRepository.getBookList).toHaveBeenCalledWith("wish");
      expect(mockScraper.getWishBooks).not.toHaveBeenCalled();
      expect(mockRepository.saveBookList).not.toHaveBeenCalled();

      if (isRight(result)) {
        expect(result.right).toBe(localBookList);
      }
    });

    it("forceRemoteフラグがtrueの場合、リモートから書籍リストを取得する", async () => {
      // モックをセットアップ
      const mockRepository = createMockRepository();
      const mockScraper = createMockScraper();

      const localBookList = BookListImpl.fromArray([book1], "wish");
      const remoteBookList = BookListImpl.fromArray([book1, book2], "wish");

      vi.mocked(mockRepository.getBookList).mockResolvedValue(right(localBookList));
      vi.mocked(mockScraper.getWishBooks).mockResolvedValue(right(remoteBookList));
      vi.mocked(mockRepository.saveBookList).mockResolvedValue(right(undefined));

      const useCase = new GetBookListWithParamsUseCase(mockRepository, mockScraper);

      // 実行
      const result = await useCase.execute({
        userId: mockUserId,
        type: "wish",
        forceRemote: true
      });

      // 検証
      expect(isRight(result)).toBe(true);
      expect(mockRepository.getBookList).toHaveBeenCalledWith("wish");
      expect(mockScraper.getWishBooks).toHaveBeenCalledWith(mockUserId);
      expect(mockRepository.saveBookList).toHaveBeenCalledWith(remoteBookList);

      if (isRight(result)) {
        expect(result.right).toBe(remoteBookList);
      }
    });

    it("ローカルリポジトリにデータがない場合、リモートから取得する", async () => {
      // モックをセットアップ
      const mockRepository = createMockRepository();
      const mockScraper = createMockScraper();

      const notFoundError = {
        code: "NOT_FOUND",
        message: "Book list not found",
        cause: new Error("Not found")
      };

      const remoteBookList = BookListImpl.fromArray([book1, book2], "wish");

      vi.mocked(mockRepository.getBookList).mockResolvedValue(left(notFoundError));
      vi.mocked(mockScraper.getWishBooks).mockResolvedValue(right(remoteBookList));
      vi.mocked(mockRepository.saveBookList).mockResolvedValue(right(undefined));

      const useCase = new GetBookListWithParamsUseCase(mockRepository, mockScraper);

      // 実行
      const result = await useCase.execute({
        userId: mockUserId,
        type: "wish",
        forceRemote: false
      });

      // 検証
      expect(isRight(result)).toBe(true);
      expect(mockRepository.getBookList).toHaveBeenCalledWith("wish");
      expect(mockScraper.getWishBooks).toHaveBeenCalledWith(mockUserId);
      expect(mockRepository.saveBookList).toHaveBeenCalledWith(remoteBookList);

      if (isRight(result)) {
        expect(result.right).toBe(remoteBookList);
      }
    });

    it("リポジトリからのエラー（NOT_FOUND以外）を適切に処理する", async () => {
      // モックをセットアップ
      const mockRepository = createMockRepository();
      const mockScraper = createMockScraper();

      const dbError = {
        code: "DB_ERROR",
        message: "Database connection error",
        cause: new Error("DB connection failed")
      };

      vi.mocked(mockRepository.getBookList).mockResolvedValue(left(dbError));

      const useCase = new GetBookListWithParamsUseCase(mockRepository, mockScraper);

      // 実行
      const result = await useCase.execute({
        userId: mockUserId,
        type: "wish",
        forceRemote: false
      });

      // 検証
      expect(isLeft(result)).toBe(true);
      expect(mockRepository.getBookList).toHaveBeenCalledWith("wish");
      expect(mockScraper.getWishBooks).not.toHaveBeenCalled();

      if (isLeft(result)) {
        expect(result.left.code).toBe("REPOSITORY_ERROR");
        expect(result.left.message).toContain("書籍リストの取得に失敗しました");
      }
    });

    it("スクレイパーからのエラーを適切に処理する", async () => {
      // モックをセットアップ
      const mockRepository = createMockRepository();
      const mockScraper = createMockScraper();

      const notFoundError = {
        code: "NOT_FOUND",
        message: "Book list not found",
        cause: new Error("Not found")
      };

      const scraperError = {
        code: "SCRAPER_ERROR",
        message: "Failed to scrape website",
        cause: new Error("Network error")
      };

      vi.mocked(mockRepository.getBookList).mockResolvedValue(left(notFoundError));
      vi.mocked(mockScraper.getWishBooks).mockResolvedValue(left(scraperError));

      const useCase = new GetBookListWithParamsUseCase(mockRepository, mockScraper);

      // 実行
      const result = await useCase.execute({
        userId: mockUserId,
        type: "wish",
        forceRemote: false
      });

      // 検証
      expect(isLeft(result)).toBe(true);
      expect(mockRepository.getBookList).toHaveBeenCalledWith("wish");
      expect(mockScraper.getWishBooks).toHaveBeenCalledWith(mockUserId);

      if (isLeft(result)) {
        expect(result.left.code).toBe("SCRAPER_ERROR");
        expect(result.left.message).toContain("リモートからの書籍リスト取得に失敗しました");
      }
    });

    it("保存時のエラーを警告として処理し、取得したデータは返す", async () => {
      // モックをセットアップ
      const mockRepository = createMockRepository();
      const mockScraper = createMockScraper();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const remoteBookList = BookListImpl.fromArray([book1, book2], "wish");

      const saveError = {
        code: "SAVE_ERROR",
        message: "Failed to save book list",
        cause: new Error("Write error")
      };

      vi.mocked(mockRepository.getBookList).mockResolvedValue(left({ code: "NOT_FOUND", message: "Not found" }));
      vi.mocked(mockScraper.getWishBooks).mockResolvedValue(right(remoteBookList));
      vi.mocked(mockRepository.saveBookList).mockResolvedValue(left(saveError));

      const useCase = new GetBookListWithParamsUseCase(mockRepository, mockScraper);

      // 実行
      const result = await useCase.execute({
        userId: mockUserId,
        type: "wish",
        forceRemote: false
      });

      // 検証
      expect(isRight(result)).toBe(true);
      expect(mockRepository.getBookList).toHaveBeenCalledWith("wish");
      expect(mockScraper.getWishBooks).toHaveBeenCalledWith(mockUserId);
      expect(mockRepository.saveBookList).toHaveBeenCalledWith(remoteBookList);
      expect(consoleSpy).toHaveBeenCalled();

      if (isRight(result)) {
        expect(result.right).toBe(remoteBookList);
      }

      // スパイをリセット
      consoleSpy.mockRestore();
    });
  });
});
