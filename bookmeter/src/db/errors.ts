/**
 * db モジュールで使用するエラー型定義。
 */

import { BaseError } from "../../../.libs/lib";

export type DbErrorContext =
  | { type: "loadFailed"; tableName: string }
  | { type: "saveFailed"; tableName: string }
  | {
      type: "invalidBookData";
      tableName: string;
      bookmeterUrl: string;
      fieldName: string;
      valueType: string;
    }
  | { type: "exportFailed"; csvPath: string }
  | { type: "uploadFailed"; filePath: string };

export class DbError extends BaseError {
  constructor(
    public readonly context: DbErrorContext,
    options?: { cause?: unknown }
  ) {
    super(`DB error [${context.type}]`, options);
  }
}
