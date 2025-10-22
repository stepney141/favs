import type { Logger } from "@/shared/logging/Logger";

export class ConsoleLogger implements Logger {
  constructor(private readonly prefix: string = "Bookmeter") {}

  info(message: string): void {
    console.log(`[INFO] [${this.prefix}] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[WARN] [${this.prefix}] ${message}`);
  }

  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      console.error(`[ERROR] [${this.prefix}] ${message}: ${error.message}`);
    } else if (error) {
      console.error(`[ERROR] [${this.prefix}] ${message}:`, error);
    } else {
      console.error(`[ERROR] [${this.prefix}] ${message}`);
    }
  }

  debug(message: string): void {
    if (process.env.DEBUG === "true") {
      console.debug(`[DEBUG] [${this.prefix}] ${message}`);
    }
  }
}
