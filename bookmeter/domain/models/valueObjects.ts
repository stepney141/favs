import { Either, left, right, isLeft, isRight, fold } from "./either";
import { Option, some, none, fromNullable } from "./option";

/**
 * ドメイン固有の値オブジェクトを定義するファイル
 * これらは単なる型ではなく、検証ロジックを伴う値オブジェクト
 */

/**
 * ブランド型を使った型安全な値オブジェクト
 */
export type Brand<K, T> = K & { readonly _brand: T };

/**
 * ISBNの値オブジェクト
 */
export type ISBN10 = Brand<string, "ISBN10">;
export type ISBN13 = Brand<string, "ISBN13">;
export type ASIN = Brand<string, "ASIN">;
export type BookId = Brand<string, "BookId">;
export type UserId = Brand<string, "UserId">;

/**
 * 書籍リストの種類
 */
export type BookListType = "wish" | "stacked";

/**
 * 図書館の識別子
 */
export type LibraryId = Brand<string, "LibraryId">;

/**
 * 書誌情報のソース
 */
export type BiblioInfoSource = "OpenBD" | "ISBNdb" | "Amazon" | "NDL" | "GoogleBooks";

/**
 * 書誌情報取得時のエラー状態
 */
export type BiblioinfoErrorStatus =
  | `Not_found_in_${BiblioInfoSource}`
  | "INVALID_ISBN"
  | "OpenBD_API_ERROR"
  | "ISBNdb_API_ERROR"
  | "NDL_API_ERROR"
  | "GoogleBooks_API_ERROR";

/**
 * 処理結果を表す型（成功か失敗か）
 * 互換性のために残すが、新しいコードではEitherを使用する
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly type: "success";
  readonly value: T;
}

export interface Failure<E> {
  readonly type: "failure";
  readonly error: E;
}

export const success = <T>(value: T): Success<T> => ({
  type: "success",
  value
});

export const failure = <E>(error: E): Failure<E> => ({
  type: "failure",
  error
});

export const isSuccess = <T, E>(result: Result<T, E>): result is Success<T> => result.type === "success";

export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> => result.type === "failure";

/**
 * ResultをEitherに変換
 */
export const toEither = <T, E>(result: Result<T, E>): Either<E, T> =>
  isSuccess(result) ? right(result.value) : left(result.error);

/**
 * EitherをResultに変換
 */
export const fromEither = <E, T>(either: Either<E, T>): Result<T, E> => {
  if (isRight(either)) {
    return success(either.right);
  } else {
    return failure(either.left);
  }
};

/**
 * 値を取得。失敗の場合は例外を投げる
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (isSuccess(result)) {
    return result.value;
  }

  // エラーがErrorオブジェクトでない場合は、Errorオブジェクトでラップする
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
};

// Option型とEither型をエクスポート
export { Option, some, none, fromNullable };
export { Either, left, right, isLeft, isRight, fold };
