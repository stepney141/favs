/**
 * ロガーのポート
 * アプリケーション層で使用するログインターフェース
 */
export interface Logger {
  /**
   * デバッグレベルのログを出力
   * アプリケーションの詳細な内部状態や処理の流れを示す情報
   */
  debug(message: string, context?: Record<string, unknown>): void;
  
  /**
   * 情報レベルのログを出力
   * アプリケーションの通常の動作状況を示す情報
   */
  info(message: string, context?: Record<string, unknown>): void;
  
  /**
   * 警告レベルのログを出力
   * エラーではないが注意が必要な状況を示す情報
   */
  warn(message: string, context?: Record<string, unknown>): void;
  
  /**
   * エラーレベルのログを出力
   * アプリケーションの正常な動作が妨げられる問題を示す情報
   */
  error(message: string, context?: Record<string, unknown>): void;
}
