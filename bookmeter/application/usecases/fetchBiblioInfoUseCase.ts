import { BookListImpl } from "../../domain/models/book";
import { right, left } from "../../domain/models/either";
import { isSome } from "../../domain/models/option";

import type { Book, BookList } from "../../domain/models/book";
import type { Either } from "../../domain/models/either";
import type { UseCase, UseCaseError } from "../ports/input/useCase";
import type { BiblioInfoProviderAggregator } from "../ports/output/biblioInfoProvider";

/**
 * 書誌情報取得ユースケースのエラー型
 */
export interface FetchBiblioInfoError extends UseCaseError {
  readonly code: "PROVIDER_ERROR" | "VALIDATION_ERROR";
}

/**
 * 書誌情報取得ユースケースの入力型（単一書籍用）
 */
export interface FetchBookBiblioInfoInput {
  readonly book: Book;
  readonly apiKeys?: Record<string, string>;
  readonly providers?: string[]; // 使用するプロバイダーを指定（指定がない場合は全て使用）
}

/**
 * 書誌情報取得ユースケースの入力型（複数書籍用）
 */
export interface FetchBookListBiblioInfoInput {
  readonly bookList: BookList;
  readonly apiKeys?: Record<string, string>;
  readonly providers?: string[]; // 使用するプロバイダーを指定（指定がない場合は全て使用）
  readonly concurrency?: number; // 同時実行数（デフォルト: 5）
  readonly skipExistingInfo?: boolean; // 既に情報が存在する場合はスキップするかどうか
}

/**
 * 単一書籍の書誌情報を取得するユースケース
 */
export class FetchBookBiblioInfoUseCase implements UseCase<FetchBookBiblioInfoInput, Book, FetchBiblioInfoError> {
  constructor(private readonly biblioInfoAggregator: BiblioInfoProviderAggregator) {}

  /**
   * 指定された書籍の書誌情報を取得して充実させます
   * @param input 入力パラメーター
   */
  async execute(input: FetchBookBiblioInfoInput): Promise<Either<FetchBiblioInfoError, Book>> {
    try {
      await Promise.resolve(); // ESLintのasync/awaitエラーを回避するためのダミーawait

      // 書誌情報プロバイダーを使って書籍情報を充実させる
      const enrichResult = await this.biblioInfoAggregator.enrichBook(input.book, input.apiKeys);

      if (enrichResult._tag === "Left") {
        return left({
          code: "PROVIDER_ERROR",
          message: `書誌情報の取得に失敗しました: ${enrichResult.left.message}`,
          cause: enrichResult.left
        });
      }

      return right(enrichResult.right);
    } catch (error) {
      return left({
        code: "VALIDATION_ERROR",
        message: "書誌情報取得処理中にエラーが発生しました",
        cause: error
      });
    }
  }
}

/**
 * 書籍リストの書誌情報を一括取得するユースケース
 */
export class FetchBookListBiblioInfoUseCase
  implements UseCase<FetchBookListBiblioInfoInput, BookList, FetchBiblioInfoError>
{
  constructor(private readonly biblioInfoAggregator: BiblioInfoProviderAggregator) {}

  /**
   * 指定された書籍リストの書誌情報を一括取得して充実させます
   * @param input 入力パラメーター
   */
  async execute(input: FetchBookListBiblioInfoInput): Promise<Either<FetchBiblioInfoError, BookList>> {
    try {
      // 書籍リストから書籍の配列を取得
      const books: Book[] = [];
      for (const [_, book] of input.bookList) {
        books.push(book);
      }

      // 既に情報がある書籍をフィルタリング（オプション）
      const booksToProcess = input.skipExistingInfo
        ? books.filter(
            (book) => !isSome(book.publisher) || !isSome(book.publishedDate) || book.title === "" || book.author === ""
          )
        : books;

      // 書誌情報を一括取得
      const enrichResult = await this.biblioInfoAggregator.enrichBooks(booksToProcess, input.apiKeys);

      if (enrichResult._tag === "Left") {
        return left({
          code: "PROVIDER_ERROR",
          message: `書誌情報の一括取得に失敗しました: ${enrichResult.left.message}`,
          cause: enrichResult.left
        });
      }

      // 更新された書籍でリストを更新
      const updatedBooks = enrichResult.right;
      const resultList =
        input.bookList.type === "wish" ? BookListImpl.createEmpty("wish") : BookListImpl.createEmpty("stacked");

      // 更新された書籍とスキップされた書籍を含めて結果のリストを作成
      if (input.skipExistingInfo) {
        // スキップされた書籍と更新された書籍を組み合わせる
        const processedIsbns = new Set(updatedBooks.map((book) => book.isbn.toString()));

        // まず更新された書籍を追加
        let newList = updatedBooks.reduce((list, book) => list.add(book), resultList);

        // 次にスキップされた書籍を追加
        newList = books
          .filter((book) => !processedIsbns.has(book.isbn.toString()))
          .reduce((list, book) => list.add(book), newList);

        return right(newList);
      } else {
        // 全ての書籍が更新されている場合は、そのまま返す
        const newList = updatedBooks.reduce((list, book) => list.add(book), resultList);

        return right(newList);
      }
    } catch (error) {
      return left({
        code: "VALIDATION_ERROR",
        message: "書誌情報の一括取得処理中にエラーが発生しました",
        cause: error
      });
    }
  }
}
