/**
 * 外部 API の可変なテキスト表現を、永続化可能な単一文字列へ正規化する。
 * XML/JSON のレスポンスでは、同じ項目でも string / array / object が混在し得る。
 */

type ExternalTextScalar = string | number | boolean;

export type ExternalTextValue =
  | ExternalTextScalar
  | readonly ExternalTextValue[]
  | { readonly [key: string]: ExternalTextValue | null | undefined }
  | null
  | undefined;

type ExternalTextRecord = {
  readonly [key: string]: ExternalTextValue | null | undefined;
};

const PREFERRED_TEXT_KEYS = ["#text", "text", "_text", "__text", "$text"] as const;
const DEFAULT_SEPARATOR = ",";

function isExternalTextArray(value: ExternalTextValue): value is readonly ExternalTextValue[] {
  return Array.isArray(value);
}

function isExternalTextRecord(value: ExternalTextValue): value is ExternalTextRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectNormalizedText(value: ExternalTextValue): readonly string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return value === "" ? [] : [value];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (isExternalTextArray(value)) {
    return value.flatMap((item) => collectNormalizedText(item));
  }
  if (!isExternalTextRecord(value)) {
    return [];
  }
  const preferredValues = PREFERRED_TEXT_KEYS.flatMap((key) => collectNormalizedText(value[key]));
  if (preferredValues.length > 0) {
    return preferredValues;
  }
  return Object.values(value).flatMap((item) => collectNormalizedText(item));
}

export function normalizeExternalText(value: ExternalTextValue, separator: string = DEFAULT_SEPARATOR): string {
  return collectNormalizedText(value).join(separator);
}
