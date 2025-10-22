import type { BookCollection } from "@/domain/entities/Book";

export type BookListDiff = {
  hasChanges: boolean;
  added: string[];
  removed: string[];
};

export class BookListDiffService {
  compare(previous: BookCollection | null, latest: BookCollection, skipComparison = false): BookListDiff {
    if (skipComparison || previous === null) {
      return { hasChanges: true, added: Array.from(latest.toMap().keys()), removed: [] };
    }

    const prevKeys = new Set(Array.from(previous.toMap().keys()));
    const latestKeys = new Set(Array.from(latest.toMap().keys()));

    const added: string[] = [];
    const removed: string[] = [];

    for (const key of latestKeys) {
      if (!prevKeys.has(key)) added.push(key);
    }
    for (const key of prevKeys) {
      if (!latestKeys.has(key)) removed.push(key);
    }

    return {
      hasChanges: added.length > 0 || removed.length > 0,
      added,
      removed
    };
  }
}
