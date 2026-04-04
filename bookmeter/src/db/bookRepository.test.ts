import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse } from "papaparse";
import { afterEach, describe, expect, it } from "vitest";

import { createDrizzleBookRepository } from "./bookRepository";
import { createDbClient } from "./client";

import type { Book, BookList } from "../domain/book";
import type { ISBN10 } from "../domain/isbn";

const tempDirs: string[] = [];

const makeBook = (bookmeterUrl: string, overrides: Partial<Book> = {}): Book => {
  return {
    bookmeter_url: bookmeterUrl,
    isbn_or_asin: "1234567890" as ISBN10,
    book_title: `title:${bookmeterUrl}`,
    author: "author",
    publisher: "publisher",
    published_date: "2024-01-01",
    sophia_opac: "",
    utokyo_opac: "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    sophia_mathlib_opac: "",
    description: "",
    ...overrides
  };
};

const toBookList = (books: Book[]): BookList => {
  return new Map(books.map((book) => [book.bookmeter_url, book]));
};

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bookmeter-repo-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("createDrizzleBookRepository", () => {
  it("loads books in the same order as the latest remote snapshot", () => {
    const repo = createDrizzleBookRepository(createDbClient(":memory:"));

    expect(repo.save(toBookList([makeBook("old-1"), makeBook("old-2")]), "wish").ok).toBe(true);
    expect(repo.save(toBookList([makeBook("new-1"), makeBook("old-1"), makeBook("old-2")]), "wish").ok).toBe(true);

    const loadResult = repo.load("wish");
    if (!loadResult.ok) {
      expect.fail(loadResult.err.message);
    }

    expect([...loadResult.value.keys()]).toEqual(["new-1", "old-1", "old-2"]);
  });

  it("exports CSV in remote order and preserves cached descriptions when reordering", async () => {
    const repo = createDrizzleBookRepository(createDbClient(":memory:"));
    const outputDir = await createTempDir();
    const csvPath = join(outputDir, "wish.csv");

    expect(
      repo.save(toBookList([makeBook("old-1", { description: "cached-description" }), makeBook("old-2")]), "wish").ok
    ).toBe(true);
    expect(repo.save(toBookList([makeBook("new-1"), makeBook("old-1"), makeBook("old-2")]), "wish").ok).toBe(true);

    const loadResult = repo.load("wish");
    if (!loadResult.ok) {
      expect.fail(loadResult.err.message);
    }

    expect(loadResult.value.get("old-1")?.description).toBe("cached-description");

    const exportResult = await repo.exportToCsv("wish", csvPath, ["bookmeter_url", "book_title"]);
    if (!exportResult.ok) {
      expect.fail(exportResult.err.message);
    }

    const csv = await readFile(csvPath, "utf-8");
    const parsed = parse<Record<string, string>>(csv, { header: true });
    expect(parsed.data.map((row) => row.bookmeter_url).filter((value) => value !== "")).toEqual([
      "new-1",
      "old-1",
      "old-2"
    ]);
  });
});
