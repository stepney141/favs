/**
 * ユースケースの基本インターフェース
 * 全てのユースケースはこのインターフェースを実装する
 */
export interface UseCase<InputType, OutputType> {
  /**
   * ユースケースを実行する
   * @param params 入力パラメータ
   * @returns 実行結果
   */
  execute(params: InputType): Promise<OutputType>;
}
