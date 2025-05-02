/**
 * Either型の実装
 * エラー処理を型安全に行うためのモナド
 */

/**
 * Either型の共通インターフェース
 */
export interface Either<E, A> {
  readonly _tag: "Left" | "Right";
  readonly left?: E; // Leftの場合のみ値を持つ
  readonly right?: A; // Rightの場合のみ値を持つ
}

/**
 * エラーの場合のケース
 */
export interface Left<E> extends Either<E, never> {
  readonly _tag: "Left";
  readonly left: E;
}

/**
 * 成功の場合のケース
 */
export interface Right<A> extends Either<never, A> {
  readonly _tag: "Right";
  readonly right: A;
}

/**
 * 成功の場合のEitherを作成
 * @param value 格納する値
 */
export const right = <E, A>(value: A): Right<A> => ({
  _tag: "Right",
  right: value
});

/**
 * エラーの場合のEitherを作成
 * @param error 格納するエラー
 */
export const left = <E, A>(error: E): Left<E> => ({
  _tag: "Left",
  left: error
});

/**
 * Leftかどうかを判定する型ガード
 * @param either 判定するEither
 */
export const isLeft = <E, A>(either: Either<E, A>): either is Left<E> => either._tag === "Left";

/**
 * Rightかどうかを判定する型ガード
 * @param either 判定するEither
 */
export const isRight = <E, A>(either: Either<E, A>): either is Right<A> => either._tag === "Right";

/**
 * 関数をEitherの値に適用する。Leftの場合は何もしない。
 * @param f 適用する関数
 */
export const map =
  <E, A, B>(f: (a: A) => B) =>
  (fa: Either<E, A>): Either<E, B> => {
    if (isRight(fa)) {
      return right(f(fa.right));
    }
    return fa as unknown as Either<E, B>;
  };

/**
 * Either値に関数を適用し、結果のEitherをフラット化する
 * @param f 適用する関数
 */
export const chain =
  <E, A, B>(f: (a: A) => Either<E, B>) =>
  (fa: Either<E, A>): Either<E, B> => {
    if (isRight(fa)) {
      return f(fa.right);
    }
    return fa as unknown as Either<E, B>;
  };

/**
 * Eitherを分岐処理する
 * @param onLeft Left の場合に実行する関数
 * @param onRight Right の場合に実行する関数
 */
export const fold =
  <E, A, B>(onLeft: (e: E) => B, onRight: (a: A) => B) =>
  (fa: Either<E, A>): B => {
    if (isRight(fa)) {
      return onRight(fa.right);
    }
    if (isLeft(fa)) {
      return onLeft(fa.left);
    }
    // 型安全性のため、決して実行されない行（Eitherは必ずLeftかRight）
    throw new Error("Either must be either Left or Right");
  };

/**
 * パイプライン関数
 * 値に一連の関数を順番に適用する
 */
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E): E;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F
): F;
export function pipe(a: unknown, ...fns: Array<(a: unknown) => unknown>): unknown {
  return fns.reduce((acc, fn) => fn(acc), a);
}

/**
 * try/catchを型安全に扱うためのヘルパー関数
 * @param f 実行する関数
 * @param onError エラーハンドリング関数
 */
export const tryCatch = <E, A>(f: () => A, onError: (error: unknown) => E): Either<E, A> => {
  try {
    return right(f());
  } catch (error) {
    return left(onError(error));
  }
};

/**
 * PromiseをEitherに変換するヘルパー関数
 * @param promise 変換するPromise
 * @param onError エラーハンドリング関数
 */
export const tryCatchAsync = <E, A>(promise: Promise<A>, onError: (error: unknown) => E): Promise<Either<E, A>> => {
  return promise.then((value) => right<E, A>(value)).catch((error) => left<E, A>(onError(error)));
};

/**
 * Leftの場合にデフォルト値を返す
 * @param defaultValue デフォルト値
 */
export const getOrElse =
  <E, A>(defaultValue: A) =>
  (fa: Either<E, A>): A => {
    if (isRight(fa)) {
      return fa.right;
    }
    return defaultValue;
  };

/**
 * 条件関数を満たすRightのみをフィルタリングする
 * @param predicate 条件関数
 * @param onFalse 条件を満たさない場合のエラー値
 */
export const filterOrElse =
  <E, A>(predicate: (a: A) => boolean, onFalse: (a: A) => E) =>
  (fa: Either<E, A>): Either<E, A> => {
    if (isRight(fa) && !predicate(fa.right)) {
      return left(onFalse(fa.right));
    }
    return fa;
  };
