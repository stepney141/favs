import { isAsin, isIsbn10, routeIsbn10, type ISBN10 } from "../book-id";

import type { Book } from "../entities/book";

/**
 * ISBNが日本のものかどうかを判定する
 * ISBN-10のグループ識別子（グループ4）を使用して日本のISBNを検出
 *
 * @param identifier - 判定対象のISBNまたはASIN
 * @returns 日本のISBN-10の場合はtrue
 */
export function isJapaneseIsbn(identifier: Book["isbnOrAsin"]): boolean {
  if (identifier === null || identifier === undefined) {
    return false;
  }
  if (isAsin(identifier) || !isIsbn10(identifier)) {
    return false;
  }
  return routeIsbn10(identifier as ISBN10) === "Japan";
}

/**
 * ISBNの発行元に基づいて書誌情報ソースの優先順位を計算する
 * 数値が小さいほど優先度が高い
 *
 * 優先順位のルール:
 * - 日本のISBN: NDL (0) → ISBNdb (1) → その他 (2)
 * - 海外のISBN: ISBNdb (0) → NDL (1) → その他 (2)
 *
 * @param target - 書誌情報ソース名
 * @param isJapan - 日本のISBNかどうか
 * @returns 優先度の値 (0 = 最高, 2 = 最低)
 */
export function calculateFetcherPriority(target: string, isJapan: boolean): number {
  if (target === "NDL") {
    return isJapan ? 0 : 1;
  }
  if (target === "ISBNdb") {
    return isJapan ? 1 : 0;
  }
  return 2;
}
