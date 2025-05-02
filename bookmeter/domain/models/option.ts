/**
 * Option型の実装
 * null/undefinedを型安全に扱うためのモナド
 */

/**
 * Option型の共通インターフェース
 */
export interface Option<A> {
  readonly _tag: 'Some' | 'None';
  readonly value?: A; // Someの場合のみ値を持つ
}

/**
 * 値が存在する場合のケース
 */
export interface Some<A> extends Option<A> {
  readonly _tag: 'Some';
  readonly value: A;
}

/**
 * 値が存在しない場合のケース
 */
export interface None extends Option<never> {
  readonly _tag: 'None';
}

/**
 * 値が存在する場合のOptionを作成
 * @param value 格納する値
 */
export const some = <A>(value: A): Some<A> => ({
  _tag: 'Some',
  value
});

/**
 * 値が存在しない場合のOptionを作成
 */
export const none: None = {
  _tag: 'None'
};

/**
 * 値がnullまたはundefinedの場合はNone、そうでなければSomeを返す
 * @param value 変換する値
 */
export const fromNullable = <A>(value: A | null | undefined): Option<A> => {
  if (value === null || value === undefined) {
    return none;
  }
  return some(value);
};

/**
 * Someかどうかを判定する型ガード
 * @param fa 判定するOption
 */
export const isSome = <A>(fa: Option<A>): fa is Some<A> => fa._tag === 'Some';

/**
 * Noneかどうかを判定する型ガード
 * @param fa 判定するOption
 */
export const isNone = <A>(fa: Option<A>): fa is None => fa._tag === 'None';

/**
 * Optionから値を取り出す。値がない場合はデフォルト値を返す。
 * @param defaultValue デフォルト値
 */
export const getOrElse = <A>(defaultValue: A) => (option: Option<A>): A => {
  if (isSome(option)) {
    return option.value;
  }
  return defaultValue;
};

/**
 * 関数をOptionの値に適用する。値がない場合は何もしない。
 * @param f 適用する関数
 */
export const map = <A, B>(f: (a: A) => B) => (fa: Option<A>): Option<B> => {
  if (isSome(fa)) {
    return some(f(fa.value));
  }
  return none;
};

/**
 * Option値に関数を適用し、結果のOptionをフラット化する
 * @param f 適用する関数
 */
export const chain = <A, B>(f: (a: A) => Option<B>) => (fa: Option<A>): Option<B> => {
  if (isSome(fa)) {
    return f(fa.value);
  }
  return none;
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
 * Optionを分岐処理する
 * @param onNone None の場合に実行する関数
 * @param onSome Some の場合に実行する関数
 */
export const fold = <A, B>(onNone: () => B, onSome: (a: A) => B) => (fa: Option<A>): B => {
  if (isSome(fa)) {
    return onSome(fa.value);
  }
  return onNone();
};

/**
 * 条件関数を満たすOptionのみをフィルタリングする
 * @param predicate 条件関数
 */
export const filter = <A>(predicate: (a: A) => boolean) => (fa: Option<A>): Option<A> => {
  if (isSome(fa) && predicate(fa.value)) {
    return fa;
  }
  return none;
};

/**
 * 2つのOptionを合成する関数。どちらもSomeならSome、どちらかがNoneならNone。
 * @param fb 2つ目のOption
 */
export const ap = <A, B>(fb: Option<B>) => (fa: Option<(b: B) => A>): Option<A> => {
  if (isSome(fa) && isSome(fb)) {
    return some(fa.value(fb.value));
  }
  return none;
};
