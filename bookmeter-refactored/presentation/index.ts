import path from "path";

import { isAxiosError } from "axios";
import { config } from "dotenv";

import { executeCommand, parseCliArguments } from "./cli/commandExecutor";
import { createAppContext } from "./di/container";

import type { AppContext } from "./di/container";

// 環境変数の読み込み
config({ path: path.join(__dirname, "../../.env") });

/**
 * アプリケーションのエントリポイント
 * 責務:
 * 1. コマンドライン引数の解析 (yargsを使用)
 * 2. アプリケーションコンテキストのセットアップ
 * 3. ユースケース実行のオーケストレーション
 * 4. 全体的なエラーハンドリング
 */
export async function main(argv: string[]): Promise<void> {
  const startTime = Date.now();

  try {
    // コマンドライン引数の解析
    const { mode, options } = await parseCliArguments(argv);

    // アプリケーションコンテキストのセットアップ
    const appContext: AppContext = createAppContext();

    // コマンドの実行
    await executeCommand(appContext, mode, options);

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
