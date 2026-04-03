import { describe, expect, it } from "vitest";

import { Ok } from "../../../.libs/lib";
import { makeEmptyBook } from "../domain/book";

import { buildExistingDescriptionMap, buildKinokuniyaBookUrl, canFetchKinokuniyaDescription } from "./kinokuniya";

import type { ISBN10 } from "../domain/isbn";

const asIsbn10 = (value: string): ISBN10 => value as ISBN10;

describe("canFetchKinokuniyaDescription", () => {
  it("accepts ISBN-10 and rejects ASIN-like identifiers", () => {
    expect(canFetchKinokuniyaDescription("4062938428")).toBe(true);
    expect(canFetchKinokuniyaDescription("B000FC0PBC")).toBe(false);
  });
});

describe("buildKinokuniyaBookUrl", () => {
  it("routes Japanese books to dsg-01", () => {
    expect(buildKinokuniyaBookUrl(asIsbn10("4062938428"))).toContain("/dsg-01-");
  });

  it("routes non-Japanese books to dsg-02", () => {
    expect(buildKinokuniyaBookUrl(asIsbn10("0306406152"))).toContain("/dsg-02-");
  });
});

describe("buildExistingDescriptionMap", () => {
  it("keeps only non-empty descriptions", () => {
    const withDescription = {
      ...makeEmptyBook(asIsbn10("4062938428")),
      bookmeter_url: "https://example.com/book-1",
      description: "desc"
    };
    const withoutDescription = {
      ...makeEmptyBook(asIsbn10("0306406152")),
      bookmeter_url: "https://example.com/book-2",
      description: " "
    };

    const descriptions = buildExistingDescriptionMap(
      "wish",
      Ok(
        new Map([
          [withDescription.bookmeter_url, withDescription],
          [withoutDescription.bookmeter_url, withoutDescription]
        ])
      )
    );

    expect(descriptions).toEqual(new Map([["4062938428", "desc"]]));
  });
});
