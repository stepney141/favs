/**
 * アプリケーション全体の基底エラークラス
 * すべての独自エラーの基底となるクラス
 */
export class AppError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;

    // Error stacktraceを適切に保持する
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * バリデーションエラー
 * 入力値の検証に失敗した場合に使用
 */
export class ValidationError extends AppError {
  readonly field: string;
  readonly value?: unknown;

  constructor(message: string, field: string, value?: unknown, cause?: unknown) {
    super(message, "VALIDATION_ERROR", cause);
    this.field = field;
    this.value = value;
  }
}

/**
 * API呼び出し関連のエラー
 * 外部APIとの通信に失敗した場合に使用
 */
export class ApiError extends AppError {
  readonly statusCode?: number;
  readonly endpoint: string;

  constructor(message: string, statusCode: number | undefined, endpoint: string, cause?: unknown) {
    super(message, `API_ERROR_${statusCode || "UNKNOWN"}`, cause);
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }

  /**
   * ネットワークエラーかどうか
   * ステータスコードが存在しない場合はネットワークエラーと判断
   */
  get isNetworkError(): boolean {
    return this.statusCode === undefined;
  }

  /**
   * クライアントエラーかどうか
   * ステータスコードが4xx台の場合
   */
  get isClientError(): boolean {
    return !!this.statusCode && this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * サーバーエラーかどうか
   * ステータスコードが5xx台の場合
   */
  get isServerError(): boolean {
    return !!this.statusCode && this.statusCode >= 500;
  }

  /**
   * リトライ可能なエラーかどうか
   * ネットワークエラー、サーバーエラー、レート制限(429)の場合
   */
  get isRetryable(): boolean {
    return this.isNetworkError || this.isServerError || this.statusCode === 429;
  }
}

/**
 * データベース関連のエラー
 * データベース操作に失敗した場合に使用
 */
export class DatabaseError extends AppError {
  readonly operation: string;
  readonly tableName?: string;

  constructor(message: string, operation: string, tableName?: string, cause?: unknown) {
    super(message, "DATABASE_ERROR", cause);
    this.operation = operation;
    this.tableName = tableName;
  }
}

/**
 * スクレイピング関連のエラー
 * Webスクレイピングに失敗した場合に使用
 */
export class ScrapingError extends AppError {
  readonly url: string;
  readonly selector?: string;

  constructor(message: string, url: string, selector?: string, cause?: unknown) {
    super(message, "SCRAPING_ERROR", cause);
    this.url = url;
    this.selector = selector;
  }
}

/**
 * ファイル操作関連のエラー
 * ファイルの読み書きに失敗した場合に使用
 */
export class FileError extends AppError {
  readonly path: string;
  readonly operation: "read" | "write" | "delete" | "create" | "move" | "copy";

  constructor(
    message: string,
    path: string,
    operation: "read" | "write" | "delete" | "create" | "move" | "copy",
    cause?: unknown
  ) {
    super(message, "FILE_ERROR", cause);
    this.path = path;
    this.operation = operation;
  }
}

/**
 * 設定関連のエラー
 * 設定値の取得や検証に失敗した場合に使用
 */
export class ConfigError extends AppError {
  readonly key?: string;

  constructor(message: string, key?: string, cause?: unknown) {
    super(message, "CONFIG_ERROR", cause);
    this.key = key;
  }
}

/**
 * エラーをAppErrorに正規化する
 * 任意のエラーをアプリケーション固有のエラーに変換する
 * @param error 変換元のエラー
 * @param context コンテキスト情報
 * @returns 正規化されたAppError
 */
export function normalizeError(error: unknown, context?: string): AppError {
  // 既にAppErrorのサブクラスの場合はそのまま返す
  if (error instanceof AppError) {
    return error;
  }

  // Error型の場合
  if (error instanceof Error) {
    return new AppError(`${context ? `[${context}] ` : ""}${error.message}`, "UNKNOWN_ERROR", error);
  }

  // その他の値
  return new AppError(`${context ? `[${context}] ` : ""}予期せぬエラー: ${String(error)}`, "UNKNOWN_ERROR", error);
}
