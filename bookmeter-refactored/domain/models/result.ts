/**
 * 成功と失敗を表現する Result 型
 * シンプルなディスクリミネーテッドユニオンとして実装
 */

/**
 * 成功した結果
 */
export interface Success<T> {
  readonly tag: "success";
  readonly value: T;

  // メソッドAPI
  isSuccess(): boolean;
  isError(): boolean;
  unwrap(): T;
  unwrapError(): never;
}

/**
 * 失敗した結果
 */
export interface Failure<E> {
  readonly tag: "failure";
  readonly error: E;

  // メソッドAPI
  isSuccess(): boolean;
  isError(): boolean;
  unwrap(): never;
  unwrapError(): E;
}

/**
 * 成功か失敗のいずれかの結果
 */
export type Result<E, T> = Success<T> | Failure<E>;

/**
 * 成功の結果を作成
 */
export function ok<E, T>(value: T): Result<E, T> {
  return {
    tag: "success",
    value,

    isSuccess() {
      return true;
    },

    isError() {
      return false;
    },

    unwrap() {
      return value;
    },

    unwrapError(): never {
      throw new Error("成功値からエラーを取り出すことはできません");
    }
  };
}

/**
 * 失敗の結果を作成
 */
export function err<E, T>(error: E): Result<E, T> {
  return {
    tag: "failure",
    error,

    isSuccess() {
      return false;
    },

    isError() {
      return true;
    },

    unwrap(): never {
      throw new Error(`値の取得に失敗しました: ${JSON.stringify(error)}`);
    },

    unwrapError() {
      return error;
    }
  };
}

/**
 * 結果が成功かどうかを判定（関数版）
 */
export function isSuccess<E, T>(result: Result<E, T>): result is Success<T> {
  return result.tag === "success";
}

/**
 * 結果が失敗かどうかを判定（関数版）
 */
export function isError<E, T>(result: Result<E, T>): result is Failure<E> {
  return result.tag === "failure";
}

/**
 * 成功なら値を返し、失敗ならエラーを投げる（関数版）
 */
export function unwrap<E, T>(result: Result<E, T>): T {
  if (isSuccess(result)) {
    return result.value;
  }
  throw new Error(`値の取得に失敗しました: ${JSON.stringify(result.error)}`);
}

/**
 * 失敗ならエラーを返し、成功なら例外を投げる（関数版）
 */
export function unwrapError<E, T>(result: Result<E, T>): E {
  if (isError(result)) {
    return result.error;
  }
  throw new Error("エラーは存在しません");
}

/**
 * 成功なら onSuccess を、失敗なら onError を実行
 */
export function match<E, T, U>(result: Result<E, T>, onSuccess: (value: T) => U, onError: (error: E) => U): U {
  if (isSuccess(result)) {
    return onSuccess(result.value);
  }
  return onError(result.error);
}

/**
 * 成功なら値変換し、失敗ならそのまま
 */
export function map<E, T, U>(result: Result<E, T>, f: (value: T) => U): Result<E, U> {
  if (isSuccess(result)) {
    return ok(f(result.value));
  }
  return result;
}

/**
 * 失敗ならエラー変換し、成功ならそのまま
 */
export function mapError<E, F, T>(result: Result<E, T>, f: (error: E) => F): Result<F, T> {
  if (isError(result)) {
    return err(f(result.error));
  }
  return result;
}

/**
 * 値を取得、失敗ならデフォルト値を返す
 */
export function getOrElse<E, T>(result: Result<E, T>, defaultValue: T): T {
  if (isSuccess(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * 成功なら副作用を実行し結果はそのまま返す
 */
export function tap<E, T>(result: Result<E, T>, f: (value: T) => void): Result<E, T> {
  if (isSuccess(result)) {
    f(result.value);
  }
  return result;
}

/**
 * すべての結果が成功なら値の配列を返し、一つでも失敗なら最初の失敗を返す
 */
export function all<E, T>(results: Array<Result<E, T>>): Result<E, T[]> {
  const values: T[] = [];

  for (const result of results) {
    if (isError(result)) {
      return result;
    }
    values.push(result.value);
  }

  return ok(values);
}
