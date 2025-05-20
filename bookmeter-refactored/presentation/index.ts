import path from "path";

import { isAxiosError } from "axios";
import { config } from "dotenv";

import { executeCommand } from "./cli/commandExecutor";
import { BOOKMETER_USER_ID } from "./cli/constants";
import { setupDependencies } from "./di/container";

import type { DIContainer } from "./di/container";

// 環境変数の読み込み
config({ path: path.join(__dirname, "../../.env") });

/**
 * コマンドライン引数を解析して適切なモードを返す
 */
function parseMode(argv: string[]): "wish" | "stacked" {
  const mode = argv[2];
  if (mode === "wish" || mode === "stacked") {
    return mode;
  } else {
    throw new Error("プロセスモードを指定してください (wish または stacked)");
  }
}

/**
 * コマンドライン引数からオプションを抽出する
 */
function parseOptions(argv: string[]): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  // --key=value または --flag 形式のオプションを解析
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const parts = arg.slice(2).split("=");
      const key = parts[0].replace(/-([a-z])/g, (_: string, char: string) => char.toUpperCase()); // kebab-case to camelCase
      const value = parts.length > 1 ? parts[1] : true;
      options[key] = value;
    }
  }

  return options;
}

/**
 * アプリケーションのエントリポイント
 * 責務:
 * 1. コマンドライン引数の解析
 * 2. 依存性注入コンテナのセットアップ
 * 3. ユースケース実行のオーケストレーション
 * 4. 全体的なエラーハンドリング
 */
export async function main(argv: string[]): Promise<void> {
  const startTime = Date.now();

  try {
    // コマンドライン引数の解析
    const mode = parseMode(argv);
    const options = parseOptions(argv);

    if (!options.userId) {
      options.userId = BOOKMETER_USER_ID.stepney141;
    }

    // 依存性注入コンテナのセットアップ
    const container: DIContainer = setupDependencies();

    // コマンドの実行
    await executeCommand(container, mode, options);

    console.log(`処理にかかった時間: ${Math.round((Date.now() - startTime) / 1000)}秒`);
  } catch (error) {
    // エラーのタイプに応じた処理
    if (isAxiosError(error)) {
      const { status, message } = error;
      console.error(`APIエラー: ${status} ${message}`);
    } else if (error instanceof Error) {
      console.error(`エラーが発生しました: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(`予期しないエラーが発生しました: ${String(error)}`);
    }
    process.exit(1);
  }
}

// スクリプト直接実行時のエントリポイント
if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error("予期しないエラーが発生しました:", error);
    process.exit(1);
  });
}
