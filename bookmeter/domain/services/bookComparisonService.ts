import { diffBookLists } from '../models/book';
import { pipe } from '../models/option';

import type { BookList, BookListDiff} from '../models/book';

/**
 * 書籍リスト比較サービス
 * 2つの書籍リストを比較して差分を検出する
 */
export class BookComparisonService {
  /**
   * 2つの書籍リストを比較して差分を検出する
   * @param oldList 以前の書籍リスト
   * @param newList 新しい書籍リスト
   * @returns 差分情報
   */
  static compareBookLists(oldList: BookList, newList: BookList): BookListDiff {
    return diffBookLists(oldList, newList);
  }
  
  /**
   * 書籍リストに変更があるかどうかを判定する
   * @param oldList 以前の書籍リスト
   * @param newList 新しい書籍リスト
   * @returns 変更があるかどうか
   */
  static hasChanges(oldList: BookList | null, newList: BookList): boolean {
    if (oldList === null) {
      return true; // 前回のリストがない場合は変更ありと判断
    }
    
    // 書籍数が異なる場合は変更あり
    if (oldList.size() !== newList.size()) {
      return true;
    }
    
    // 詳細な差分を取得
    const diff = this.compareBookLists(oldList, newList);
    
    // 追加/削除/変更があるかどうかを判定
    return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
  }
  
  /**
   * 差分の概要を取得する（ログ出力用）
   * @param diff 差分情報
   * @returns 差分の概要文字列
   */
  static getDiffSummary(diff: BookListDiff): string {
    return pipe(
      diff,
      diff => {
        const addedCount = diff.added.length;
        const removedCount = diff.removed.length;
        const changedCount = diff.changed.length;
        const unchangedCount = diff.unchanged.length;
        const totalCount = addedCount + removedCount + changedCount + unchangedCount;
        
        const parts: string[] = [];
        
        if (addedCount > 0) {
          parts.push(`${addedCount}冊追加`);
        }
        
        if (removedCount > 0) {
          parts.push(`${removedCount}冊削除`);
        }
        
        if (changedCount > 0) {
          parts.push(`${changedCount}冊変更`);
        }
        
        if (parts.length === 0) {
          return '変更なし';
        }
        
        return `${parts.join('、')}（合計${totalCount}冊）`;
      }
    );
  }
  
  /**
   * 差分の詳細情報を取得する
   * @param diff 差分情報
   * @returns 差分の詳細情報
   */
  static getDiffDetails(diff: BookListDiff): { 
    added: Array<{ isbn: string; title: string }>;
    removed: Array<{ isbn: string; title: string }>;
    changed: Array<{ isbn: string; oldTitle: string; newTitle: string }>;
  } {
    return {
      added: diff.added.map(book => ({
        isbn: book.isbn.toString(),
        title: book.title
      })),
      
      removed: diff.removed.map(book => ({
        isbn: book.isbn.toString(),
        title: book.title
      })),
      
      changed: diff.changed.map(item => ({
        isbn: item.new.isbn.toString(),
        oldTitle: item.old.title,
        newTitle: item.new.title
      }))
    };
  }
  
  /**
   * 差分を考慮して書籍リストをマージする
   * @param baseList ベースとなる書籍リスト
   * @param diff マージする差分
   * @returns マージされた書籍リスト
   */
  static mergeWithDiff(baseList: BookList, diff: BookListDiff): BookList {
    // 削除された書籍を除去
    let resultList = diff.removed.reduce(
      (list, book) => list.remove(book.isbn.toString()),
      baseList
    );
    
    // 追加された書籍を追加
    resultList = diff.added.reduce(
      (list, book) => list.add(book),
      resultList
    );
    
    // 変更された書籍を更新
    resultList = diff.changed.reduce(
      (list, change) => {
        const oldIsbn = change.old.isbn.toString();
        return list.remove(oldIsbn).add(change.new);
      },
      resultList
    );
    
    return resultList;
  }
}
