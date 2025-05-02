import { describe, it, expect } from "vitest";

import { isSome, isNone } from "../../../domain/models/option";
import { isSuccess, isFailure } from "../../../domain/models/valueObjects";
import { IsbnService } from "../../../domain/services/isbnService";

describe("IsbnService", () => {
  describe("validateISBN10", () => {
    it("有効なISBN-10を検証できる", () => {
      const validIsbns = [
        "4873113369", // 正しいISBN-10
        "4-87311-336-9", // ハイフン付き
        "4 87311 336 9", // スペース付き
        "489471490X" // 最後の桁にX
      ];

      // すべての有効なISBNについてテスト
      for (const isbn of validIsbns) {
        const result = IsbnService.validateISBN10(isbn);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.value).toBe(true);
        }
      }
    });

    it("無効なISBN-10を検出できる", () => {
      const invalidIsbns = [
        "1234567890", // チェックディジット不正
        "123456789", // 桁数不足
        "12345678901", // 桁数超過
        "123456789A", // X以外の英字
        "abcdefghij" // 数字以外
      ];

      for (const isbn of invalidIsbns) {
        const result = IsbnService.validateISBN10(isbn);
        // 一部はバリデーションが失敗するケース、一部は成功するが検証結果がfalseのケース
        if (isSuccess(result)) {
          expect(result.value).toBe(false);
        } else {
          expect(isFailure(result)).toBe(true);
        }
      }
    });
  });

  describe("validateISBN13", () => {
    it("有効なISBN-13を検証できる", () => {
      const validIsbns = [
        "9784873113364", // 正しいISBN-13
        "978-4-87311-336-4", // ハイフン付き
        "978 4 87311 336 4", // スペース付き
        "9791234567897" // 979で始まるISBN
      ];

      for (const isbn of validIsbns) {
        const result = IsbnService.validateISBN13(isbn);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.value).toBe(true);
        }
      }
    });

    it("無効なISBN-13を検出できる", () => {
      const invalidIsbns = [
        "1234567890123", // 978/979で始まらない
        "97812345678", // 桁数不足
        "97812345678901", // 桁数超過
        "978123456789X", // 数字以外を含む
        "9784873113365" // チェックディジット不正
      ];

      for (const isbn of invalidIsbns) {
        const result = IsbnService.validateISBN13(isbn);
        if (isSuccess(result)) {
          expect(result.value).toBe(false);
        } else {
          expect(isFailure(result)).toBe(true);
        }
      }
    });
  });

  describe("convertISBN10ToISBN13", () => {
    it("ISBN-10からISBN-13に正しく変換できる", () => {
      const testCases = [
        { isbn10: "4873113369", expected: "9784873113364" },
        { isbn10: "4-87311-336-9", expected: "9784873113364" }, // ハイフン付き
        { isbn10: "012345672X", expected: "9780123456724" } // 最後の桁がXのケース
      ];

      for (const { isbn10, expected } of testCases) {
        const result = IsbnService.convertISBN10ToISBN13(isbn10);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.value).toBe(expected);
        }
      }
    });

    it("無効なISBN-10の変換は失敗する", () => {
      const invalidIsbns = [
        "1234567890", // チェックディジット不正
        "123456789", // 桁数不足
        "12345678901", // 桁数超過
        "abcdefghij" // 数字以外
      ];

      for (const isbn of invalidIsbns) {
        const result = IsbnService.convertISBN10ToISBN13(isbn);
        expect(isFailure(result)).toBe(true);
      }
    });
  });

  describe("parseISBN", () => {
    it("有効なISBN-10文字列をISBN10型に変換できる", () => {
      const validIsbns = ["4873113369", "4-87311-336-9", "4 87311 336 9", "489471490X"];

      for (const isbn of validIsbns) {
        const result = IsbnService.parseISBN(isbn);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          const cleanedIsbn = isbn.replace(/[-\s]/g, "");
          expect(result.value).toBe(cleanedIsbn);
        }
      }
    });

    it("有効なISBN-13文字列をISBN13型に変換できる", () => {
      const validIsbns = ["9784873113364", "978-4-87311-336-4", "978 4 87311 336 4"];

      for (const isbn of validIsbns) {
        const result = IsbnService.parseISBN(isbn);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          const cleanedIsbn = isbn.replace(/[-\s]/g, "");
          expect(result.value).toBe(cleanedIsbn);
        }
      }
    });

    it("無効なISBN文字列の変換は失敗する", () => {
      const invalidIsbns = [
        "1234567890", // 正しくないISBN-10
        "1234567890123", // 正しくないISBN-13
        "123456789", // 桁数不足
        "abcdefghij" // 数字以外
      ];

      for (const isbn of invalidIsbns) {
        const result = IsbnService.parseISBN(isbn);
        expect(isFailure(result)).toBe(true);
      }
    });
  });

  describe("isValidISBN", () => {
    it("有効なISBNに対してtrueを返す", () => {
      const validIsbns = [
        "4873113369", // ISBN-10
        "9784873113364", // ISBN-13
        "978-4-87311-336-4", // ハイフン付きISBN-13
        "489471490X" // 最後の桁がXのISBN-10
      ];

      for (const isbn of validIsbns) {
        expect(IsbnService.isValidISBN(isbn)).toBe(true);
      }
    });

    it("無効なISBNに対してfalseを返す", () => {
      const invalidIsbns = [
        "1234567890", // 正しくないISBN-10
        "1234567890123", // 正しくないISBN-13
        "123456789", // 桁数不足
        "abcdefghij" // 数字以外
      ];

      for (const isbn of invalidIsbns) {
        expect(IsbnService.isValidISBN(isbn)).toBe(false);
      }
    });
  });

  describe("extractIsbnFromAmazonUrl", () => {
    it("AmazonのURLからISBNを抽出できる", () => {
      const testCases = [
        {
          url: "https://www.amazon.co.jp/dp/4873113369/",
          expected: "4873113369"
        },
        {
          url: "https://www.amazon.com/gp/product/4873113369?psc=1",
          expected: "4873113369"
        },
        {
          url: "https://www.amazon.co.jp/ASIN/4873113369",
          expected: "4873113369"
        }
      ];

      for (const { url, expected } of testCases) {
        const result = IsbnService.extractIsbnFromAmazonUrl(url);
        expect(isSome(result)).toBe(true);
        if (isSome(result)) {
          expect(result.value).toBe(expected);
        }
      }
    });

    it("ISBNを含まないAmazonのURLからはNoneを返す", () => {
      const invalidUrls = [
        "https://www.amazon.co.jp/",
        "https://www.amazon.co.jp/gp/cart/view.html",
        "https://www.amazon.co.jp/s?k=isbn"
      ];

      for (const url of invalidUrls) {
        const result = IsbnService.extractIsbnFromAmazonUrl(url);
        expect(isNone(result)).toBe(true);
      }
    });

    it("無効なISBNが含まれるAmazonのURLからはNoneを返す", () => {
      const url = "https://www.amazon.co.jp/dp/1234567890/"; // 無効なISBN
      const result = IsbnService.extractIsbnFromAmazonUrl(url);
      // 現在の実装では、ASINの場合はISBNではないためNoneが返るべき
      expect(isNone(result)).toBe(true);
    });
  });

  describe("isASIN, isISBN10, isISBN13", () => {
    it("ASINを正しく判定できる", () => {
      const asins = [
        "B01HCKM4UY", // 有効なASIN
        "B00005JNBG", // 有効なASIN
        "1234567890" // ISBN-10の形だがチェックディジットが不正
      ];

      const notAsins = [
        "4873113369", // 有効なISBN-10
        "9784873113364", // 有効なISBN-13
        "abcdefghij", // 無効なコード
        "123456789" // 長さが不正
      ];

      for (const asin of asins) {
        expect(IsbnService.isASIN(asin)).toBe(true);
      }

      for (const notAsin of notAsins) {
        expect(IsbnService.isASIN(notAsin)).toBe(false);
      }
    });

    it("ISBN-10を正しく判定できる", () => {
      const isbn10s = [
        "4873113369", // 有効なISBN-10
        "4-87311-336-9", // ハイフン付き
        "489471490X" // 最後の桁がX
      ];

      const notIsbn10s = [
        "B01HCKM4UY", // ASIN
        "9784873113364", // ISBN-13
        "1234567890", // チェックディジット不正
        "abcdefghij" // 無効なコード
      ];

      for (const isbn10 of isbn10s) {
        expect(IsbnService.isISBN10(isbn10)).toBe(true);
      }

      for (const notIsbn10 of notIsbn10s) {
        expect(IsbnService.isISBN10(notIsbn10)).toBe(false);
      }
    });

    it("ISBN-13を正しく判定できる", () => {
      const isbn13s = [
        "9784873113364", // 有効なISBN-13
        "978-4-87311-336-4", // ハイフン付き
        "9791234567897" // 979で始まる
      ];

      const notIsbn13s = [
        "B01HCKM4UY", // ASIN
        "4873113369", // ISBN-10
        "1234567890123", // チェックディジット不正
        "97812345678901" // 長さが不正
      ];

      for (const isbn13 of isbn13s) {
        expect(IsbnService.isISBN13(isbn13)).toBe(true);
      }

      for (const notIsbn13 of notIsbn13s) {
        expect(IsbnService.isISBN13(notIsbn13)).toBe(false);
      }
    });
  });
});
