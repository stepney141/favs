import type { Either } from "../../../domain/models/either";

/**
 * 基本的なユースケースインターフェース
 *
 * このインターフェースは、アプリケーション層における全てのユースケースの基本となります。
 * 関数型プログラミングの原則に基づき、純粋関数ベースのインターフェースを提供します。
 *
 * @template Input ユースケースの入力型
 * @template Output ユースケースの出力型
 * @template Error エラー型
 */
export interface UseCase<Input, Output, Error> {
  /**
   * ユースケースを実行します
   *
   * @param input ユースケースの入力データ
   * @returns 処理結果のEither型
   */
  execute(input: Input): Promise<Either<Error, Output>>;
}

/**
 * パラメータを必要としないユースケースのインターフェース
 *
 * @template Output ユースケースの出力型
 * @template Error エラー型
 */
export interface NoInputUseCase<Output, Error> {
  /**
   * ユースケースを実行します
   *
   * @returns 処理結果のEither型
   */
  execute(): Promise<Either<Error, Output>>;
}

/**
 * 出力を返さないユースケースのインターフェース
 *
 * @template Input ユースケースの入力型
 * @template Error エラー型
 */
export interface NoOutputUseCase<Input, Error> {
  /**
   * ユースケースを実行します
   *
   * @param input ユースケースの入力データ
   * @returns 処理結果のEither型
   */
  execute(input: Input): Promise<Either<Error, void>>;
}

/**
 * 入力も出力も必要としないユースケースのインターフェース
 *
 * @template Error エラー型
 */
export interface NoInputNoOutputUseCase<Error> {
  /**
   * ユースケースを実行します
   *
   * @returns 処理結果のEither型
   */
  execute(): Promise<Either<Error, void>>;
}

/**
 * 共通ユースケースエラー
 */
export interface UseCaseError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}
