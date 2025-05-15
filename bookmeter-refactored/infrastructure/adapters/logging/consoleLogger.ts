import type { Logger } from "@/application/ports/output/logger";

/**
 * コンソールロガーの実装
 * ログメッセージをコンソールに出力するシンプルなロガー
 */
export class ConsoleLogger implements Logger {
  private readonly prefix: string;
  private readonly enabledLevels: Set<"debug" | "info" | "warn" | "error">;

  /**
   * コンストラクタ
   * @param prefix ログメッセージに付与するプレフィックス
   * @param level 有効にするログレベル。指定されたレベル以上のログが出力される
   */
  constructor(prefix: string, level: "debug" | "info" | "warn" | "error" = "info") {
    this.prefix = prefix;

    // レベルに応じて有効なログレベルを設定
    this.enabledLevels = new Set();
    switch (level) {
      case "debug":
        this.enabledLevels.add("debug");
      // fallthrough
      case "info":
        this.enabledLevels.add("info");
      // fallthrough
      case "warn":
        this.enabledLevels.add("warn");
      // fallthrough
      case "error":
        this.enabledLevels.add("error");
        break;
    }
  }

  /**
   * タイムスタンプを取得
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * ログメッセージをフォーマット
   */
  private formatMessage(level: string, message: string): string {
    return `[${this.getTimestamp()}] [${level.toUpperCase()}] [${this.prefix}] ${message}`;
  }

  /**
   * コンテキスト情報をフォーマット
   */
  private formatContext(context?: Record<string, unknown>): string {
    if (!context) return "";

    try {
      // エラーオブジェクトを特別に処理
      const processedContext = { ...context };
      if (context.error instanceof Error) {
        processedContext.error = {
          name: context.error.name,
          message: context.error.message,
          stack: context.error.stack
        };
      }

      return JSON.stringify(processedContext, null, 2);
    } catch (e) {
      return `[Context serialization failed: ${e instanceof Error ? e.message : String(e)}]`;
    }
  }

  /**
   * デバッグレベルのログ出力
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.enabledLevels.has("debug")) return;

    const formattedMessage = this.formatMessage("debug", message);
    const formattedContext = this.formatContext(context);

    console.debug(formattedMessage);
    if (formattedContext) {
      console.debug(formattedContext);
    }
  }

  /**
   * 情報レベルのログ出力
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.enabledLevels.has("info")) return;

    const formattedMessage = this.formatMessage("info", message);
    const formattedContext = this.formatContext(context);

    console.info(formattedMessage);
    if (formattedContext) {
      console.info(formattedContext);
    }
  }

  /**
   * 警告レベルのログ出力
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.enabledLevels.has("warn")) return;

    const formattedMessage = this.formatMessage("warn", message);
    const formattedContext = this.formatContext(context);

    console.warn(formattedMessage);
    if (formattedContext) {
      console.warn(formattedContext);
    }
  }

  /**
   * エラーレベルのログ出力
   */
  error(message: string, context?: Record<string, unknown>): void {
    if (!this.enabledLevels.has("error")) return;

    const formattedMessage = this.formatMessage("error", message);
    const formattedContext = this.formatContext(context);

    console.error(formattedMessage);
    if (formattedContext) {
      console.error(formattedContext);
    }
  }
}
