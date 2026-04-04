import { describe, expect, it } from "vitest";

import { parseCliArgs, resolveExecutionPlan } from "./executionMode";

const unwrapOk = <T>(result: { ok: true; value: T } | { ok: false; err: Error }): T => {
  if (result.ok) {
    return result.value;
  }

  expect.fail(result.err.message);
};

describe("resolveExecutionPlan", () => {
  it("resolves scrape-only with no downstream phases", () => {
    const plan = unwrapOk(
      resolveExecutionPlan({
        target: "wish",
        execution: { type: "scrape-only" }
      })
    );

    expect(plan.modeName).toBe("scrape-only");
    expect(plan.forceRefresh).toBe(false);
    expect(plan.scrape).toEqual({ type: "remote", doLogin: true });
    expect(plan.phases.compare).toBe(false);
    expect(plan.phases.fetchBiblio).toBe(false);
    expect(plan.phases.crawlDescriptions).toBe(false);
    expect(plan.phases.persist).toBe(false);
    expect(plan.phases.exportCsv).toBe(false);
    expect(plan.phases.uploadDb).toBe(false);
  });

  it("resolves local-downstream as a local-cache downstream pipeline", () => {
    const plan = unwrapOk(
      resolveExecutionPlan({
        target: "wish",
        execution: {
          type: "custom",
          scrape: { type: "local-cache" },
          enabledPhases: ["persist", "exportCsv", "uploadDb"]
        }
      })
    );

    expect(plan.modeName).toBe("custom");
    expect(plan.forceRefresh).toBe(false);
    expect(plan.scrape).toEqual({ type: "local-cache" });
    expect(plan.phases.compare).toBe(false);
    expect(plan.phases.fetchBiblio).toBe(false);
    expect(plan.phases.crawlDescriptions).toBe(false);
    expect(plan.phases.persist).toBe(true);
    expect(plan.phases.exportCsv).toBe(true);
    expect(plan.phases.uploadDb).toBe(true);
  });

  it("rejects custom upload without persistence", () => {
    const result = resolveExecutionPlan({
      target: "wish",
      execution: {
        type: "custom",
        scrape: { type: "remote", doLogin: true },
        enabledPhases: ["uploadDb"]
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      expect.fail("resolveExecutionPlan should reject uploadDb without persist");
    }

    expect(result.err.context.detail).toBe("Custom execution mode with uploadDb requires persist");
  });
});

describe("parseCliArgs", () => {
  it("parses a named execution mode", () => {
    expect(unwrapOk(parseCliArgs(["node", "bookmeter", "scrape-only", "stacked"]))).toEqual({
      type: "run",
      option: {
        forceRefresh: false,
        target: "stacked",
        execution: { type: "scrape-only", doLogin: true }
      }
    });
  });

  it("parses subcommand flags into execution options", () => {
    expect(
      unwrapOk(parseCliArgs(["node", "bookmeter", "full", "wish", "--user-id", "42", "--no-login", "--force"]))
    ).toEqual({
      type: "run",
      option: {
        forceRefresh: true,
        target: "wish",
        userId: "42",
        execution: { type: "full", doLogin: false }
      }
    });
  });

  it("maps local-downstream to the local-cache downstream pipeline", () => {
    expect(unwrapOk(parseCliArgs(["node", "bookmeter", "local-downstream", "wish"]))).toEqual({
      type: "run",
      option: {
        forceRefresh: false,
        target: "wish",
        execution: {
          type: "custom",
          scrape: { type: "local-cache" },
          enabledPhases: ["persist", "exportCsv", "uploadDb"]
        }
      }
    });
  });

  it("maps local-biblio to the local-cache API enrichment pipeline", () => {
    expect(unwrapOk(parseCliArgs(["node", "bookmeter", "local-biblio", "wish"]))).toEqual({
      type: "run",
      option: {
        forceRefresh: false,
        target: "wish",
        execution: {
          type: "custom",
          scrape: { type: "local-cache" },
          enabledPhases: ["fetchBiblio", "persist", "exportCsv", "uploadDb"]
        }
      }
    });
  });

  it("returns help without scheduling execution", () => {
    expect(unwrapOk(parseCliArgs(["node", "bookmeter", "full", "--help"]))).toEqual({
      type: "help"
    });
  });
});
