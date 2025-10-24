import { diffBookLists, type BookListDiff } from "../../domain/book";

import type { BookList } from "../../domain/types";

export type ComparisonContext = {
  skipComparison?: boolean;
};

export type ComparisonResult =
  | { hasChanges: true; reason: "SKIPPED" | "NO_PREVIOUS" | "DIFFERENT"; diff: BookListDiff | null }
  | { hasChanges: false; reason: "UNCHANGED"; diff: BookListDiff };

export function compareBookLists(
  previous: BookList | null,
  latest: BookList,
  { skipComparison = false }: ComparisonContext = {}
): ComparisonResult {
  if (skipComparison) {
    return { hasChanges: true, reason: "SKIPPED", diff: null };
  }

  if (previous === null) {
    return { hasChanges: true, reason: "NO_PREVIOUS", diff: null };
  }

  const diff = diffBookLists(previous, latest);
  if (diff.added.length > 0 || diff.removed.length > 0) {
    return { hasChanges: true, reason: "DIFFERENT", diff };
  }

  return { hasChanges: false, reason: "UNCHANGED", diff };
}
