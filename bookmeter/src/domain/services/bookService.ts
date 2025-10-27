import type { Book } from "../entities/book";
import type { BookRepository } from "../repositories/bookRepository";

export type BookCollectionDiff = {
  removed: Book[];
  unchanged: Book[];
  added: Book[];
};

export function diffBookCollections(previous: BookRepository, latest: BookRepository): BookCollectionDiff {
  const previousIds = new Set(previous.keys());
  const latestIds = new Set(latest.keys());

  const removed = [...previousIds.difference(latestIds)].map((id) => previous.getByUrl(id)!);
  const unchanged = [...previousIds.intersection(latestIds)].map((id) => latest.getByUrl(id)!);
  const added = [...latestIds.difference(previousIds)].map((id) => latest.getByUrl(id)!);

  return { removed, unchanged, added };
}

export type ComparisonContext = {
  skipComparison?: boolean;
};

export type ComparisonResult =
  | { hasChanges: true; reason: "SKIPPED" | "NO_PREVIOUS" | "DIFFERENT"; diff: BookCollectionDiff | null }
  | { hasChanges: false; reason: "UNCHANGED"; diff: BookCollectionDiff };

export function compareBookCollections(
  previous: BookRepository | null,
  latest: BookRepository,
  { skipComparison = false }: ComparisonContext = {}
): ComparisonResult {
  if (skipComparison) {
    return { hasChanges: true, reason: "SKIPPED", diff: null };
  }

  if (previous === null) {
    return { hasChanges: true, reason: "NO_PREVIOUS", diff: null };
  }

  const diff = diffBookCollections(previous, latest);
  if (diff.added.length > 0 || diff.removed.length > 0) {
    return { hasChanges: true, reason: "DIFFERENT", diff };
  }

  return { hasChanges: false, reason: "UNCHANGED", diff };
}
