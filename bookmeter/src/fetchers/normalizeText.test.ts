import { describe, expect, it } from "vitest";

import { normalizeExternalText } from "./normalizeText";

describe("normalizeExternalText", () => {
  it("returns strings unchanged", () => {
    expect(normalizeExternalText("上智大学出版")).toBe("上智大学出版");
  });

  it("joins arrays into a single string", () => {
    expect(normalizeExternalText(["上智大学出版", "ぎょうせい"])).toBe("上智大学出版,ぎょうせい");
  });

  it("prefers text-like keys in nested XML objects", () => {
    expect(normalizeExternalText([{ "#text": "上智大学出版" }, { "#text": "ぎょうせい", "@_role": "発売" }])).toBe(
      "上智大学出版,ぎょうせい"
    );
  });

  it("falls back to nested object values when no text key exists", () => {
    expect(
      normalizeExternalText({
        primary: "カラー",
        secondary: { value: "グラウンドワークス" }
      })
    ).toBe("カラー,グラウンドワークス");
  });

  it("returns an empty string for nullish values", () => {
    expect(normalizeExternalText(undefined)).toBe("");
    expect(normalizeExternalText(null)).toBe("");
  });
});
