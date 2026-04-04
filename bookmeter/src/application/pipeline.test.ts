import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Browser } from "puppeteer";

import { Ok } from "../../../.libs/lib";

vi.mock("../scrapers/kinokuniya", async () => {
  const actual = await vi.importActual<typeof import("../scrapers/kinokuniya")>("../scrapers/kinokuniya");

  return {
    ...actual,
    fetchKinokuniyaDescription: vi.fn()
  };
});

import { fetchKinokuniyaDescription } from "../scrapers/kinokuniya";

import { crawlDescriptionPhase, shouldRunDownstreamPhases } from "./pipeline";

import type { ExecutionPlan } from "./executionMode";
import type { BookRepository } from "../db/bookRepository";
import type { Book, BookList } from "../domain/book";
import type { ISBN10 } from "../domain/isbn";

const makeExecutionPlan = (overrides: Partial<ExecutionPlan> = {}): ExecutionPlan => {
  return {
    forceRefresh: false,
    target: "stacked",
    userId: "1003258",
    outputFilePath: null,
    modeName: "full",
    scrape: { type: "remote", doLogin: true },
    phases: {
      compare: true,
      fetchBiblio: true,
      crawlDescriptions: true,
      persist: true,
      exportCsv: true,
      uploadDb: true
    },
    ...overrides
  };
};

const makeBook = (bookmeterUrl: string): Book => {
  return {
    bookmeter_url: bookmeterUrl,
    isbn_or_asin: "4062938428" as ISBN10,
    book_title: `title:${bookmeterUrl}`,
    author: "author",
    publisher: "publisher",
    published_date: "2024-01-01",
    sophia_opac: "",
    utokyo_opac: "",
    exist_in_sophia: "No",
    exist_in_utokyo: "No",
    sophia_mathlib_opac: "",
    description: ""
  };
};

const toBookList = (urls: string[]): BookList => {
  return new Map(urls.map((url) => [url, makeBook(url)]));
};

const fetchKinokuniyaDescriptionMock = vi.mocked(fetchKinokuniyaDescription);

const createDescriptionTestContext = (
  loadedBooks: BookList = new Map()
): {
  browser: Browser;
  page: { close: ReturnType<typeof vi.fn> };
  repo: Pick<BookRepository, "load" | "updateDescription">;
  updateDescription: ReturnType<typeof vi.fn>;
} => {
  const page = {
    close: vi.fn().mockResolvedValue(undefined)
  };
  const updateDescription = vi.fn();
  const repo: Pick<BookRepository, "load" | "updateDescription"> = {
    load: vi.fn().mockReturnValue(Ok(loadedBooks)),
    updateDescription
  };

  return {
    browser: {
      newPage: vi.fn().mockResolvedValue(page)
    } as unknown as Browser,
    page,
    repo,
    updateDescription
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchKinokuniyaDescriptionMock.mockResolvedValue("fetched-description");
});

describe("shouldRunDownstreamPhases", () => {
  it("continues when forceRefresh is enabled even if the list is unchanged", () => {
    const plan = makeExecutionPlan({ forceRefresh: true });
    const bookList = toBookList(["same-1", "same-2"]);

    expect(shouldRunDownstreamPhases(plan, bookList, bookList)).toBe(true);
  });

  it("continues when the remote order differs from the local snapshot", () => {
    const plan = makeExecutionPlan();

    expect(shouldRunDownstreamPhases(plan, toBookList(["old-1", "old-2"]), toBookList(["old-2", "old-1"]))).toBe(true);
  });

  it("stops when the list is unchanged and forceRefresh is disabled", () => {
    const plan = makeExecutionPlan();
    const bookList = toBookList(["same-1", "same-2"]);

    expect(shouldRunDownstreamPhases(plan, bookList, bookList)).toBe(false);
  });
});

describe("crawlDescriptionPhase", () => {
  it("skips fetching for existing books without cached descriptions when forceRefresh is disabled", async () => {
    const plan = makeExecutionPlan({ forceRefresh: false });
    const latestBookList = toBookList(["existing-book"]);
    const prevBookList = toBookList(["existing-book"]);
    const { browser, page, repo, updateDescription } = createDescriptionTestContext();

    await crawlDescriptionPhase(plan, latestBookList, prevBookList, repo, browser);

    expect(fetchKinokuniyaDescriptionMock).not.toHaveBeenCalled();
    expect(updateDescription).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalledOnce();
  });

  it("fetches descriptions for new books when forceRefresh is disabled", async () => {
    const plan = makeExecutionPlan({ forceRefresh: false });
    const latestBookList = toBookList(["new-book"]);
    const prevBookList = toBookList(["existing-book"]);
    const { browser, repo, updateDescription } = createDescriptionTestContext();

    await crawlDescriptionPhase(plan, latestBookList, prevBookList, repo, browser);

    expect(fetchKinokuniyaDescriptionMock).toHaveBeenCalledOnce();
    expect(updateDescription).toHaveBeenCalledWith("stacked", "4062938428", "fetched-description");
    expect(latestBookList.get("new-book")?.description).toBe("fetched-description");
  });

  it("fetches descriptions for existing books when forceRefresh is enabled", async () => {
    const plan = makeExecutionPlan({ forceRefresh: true });
    const latestBookList = toBookList(["existing-book"]);
    const prevBookList = toBookList(["existing-book"]);
    const { browser, repo } = createDescriptionTestContext();

    await crawlDescriptionPhase(plan, latestBookList, prevBookList, repo, browser);

    expect(fetchKinokuniyaDescriptionMock).toHaveBeenCalledOnce();
  });

  it("treats all books as new when the previous snapshot is missing", async () => {
    const plan = makeExecutionPlan({ forceRefresh: false });
    const latestBookList = toBookList(["first-run-book"]);
    const { browser, repo } = createDescriptionTestContext();

    await crawlDescriptionPhase(plan, latestBookList, null, repo, browser);

    expect(fetchKinokuniyaDescriptionMock).toHaveBeenCalledOnce();
  });
});
