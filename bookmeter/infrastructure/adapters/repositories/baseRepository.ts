import { success, failure } from "../../../domain/models/valueObjects";

import type { Result } from "../../../domain/models/valueObjects";

/**
 * ベースリポジトリ
 * 共通のリポジトリ機能を提供する抽象クラス
 */
export abstract class BaseRepository<T, P> {
  /**
   * エンティティを保存する
   * @param entity 保存するエンティティ
   * @returns 保存結果
   */
  abstract save(entity: T): Promise<Result<void>>;

  /**
   * 条件に一致する全エンティティを取得する
   * @param params 検索条件
   * @returns 取得結果
   */
  abstract findAll(params: P): Promise<Result<T>>;

  /**
   * 条件に一致するエンティティが存在するかどうかを確認する
   * @param params 検索条件
   * @returns 存在確認結果
   */
  abstract exists(params: P): Promise<Result<boolean>>;

  /**
   * データソースへの接続を開く
   * @returns 接続結果
   */
  abstract connect(): Promise<Result<void>>;

  /**
   * データソースへの接続を閉じる
   * @returns 切断結果
   */
  abstract disconnect(): Promise<Result<void>>;

  /**
   * エラーをラップしてResultオブジェクトを返す
   * @param error エラー
   * @param message エラーメッセージ
   * @returns 失敗結果
   */
  protected wrapError(error: unknown, message: string): Result<never> {
    console.error(`${message}: `, error);
    return failure(error instanceof Error ? error : new Error(`${message}: ${String(error)}`));
  }

  /**
   * 成功結果を返す
   * @param value 値
   * @returns 成功結果
   */
  protected ok<V>(value: V): Result<V> {
    return success(value);
  }
}
