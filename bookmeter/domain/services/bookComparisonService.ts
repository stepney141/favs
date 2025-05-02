import type { Book, BookList, BookListDiff } from '../models/book';

/**
 * 書籍比較サービス
 * 2つの書籍リストを比較し、差分を特定する
 */
export class BookComparisonService {
  /**
   * 書籍リストを比較する
   * @param oldList 古い書籍リスト
   * @param newList 新しい書籍リスト
   * @returns 差分
   */
  static compareBookLists(oldList: BookList, newList: BookList): BookListDiff {
    // 実装すべき処理:
    // 1. 追加された書籍を特定 (newListにあってoldListにない)
    // 2. 削除された書籍を特定 (oldListにあってnewListにない)
    // 3. 変更された書籍を特定 (両方にあるが内容が異なる)
    // 4. 差分オブジェクトを返す
    
    const added: Book[] = [];
    const removed: Book[] = [];
    const changed: Array<{ old: Book; new: Book }> = [];
    
    // 追加された書籍を特定
    for (const [isbn, book] of newList) {
      if (!oldList.get(isbn)) {
        added.push(book);
      }
    }
    
    // 削除された書籍を特定
    for (const [isbn, book] of oldList) {
      if (!newList.get(isbn)) {
        removed.push(book);
      }
    }
    
    // 変更された書籍を特定（両方にあるが内容が異なる）
    for (const [isbn, oldBook] of oldList) {
      const newBook = newList.get(isbn);
      if (newBook && this.isBookChanged(oldBook, newBook)) {
        changed.push({ old: oldBook, new: newBook });
      }
    }
    
    return {
      added,
      removed,
      changed
    };
  }
  
  /**
   * 書籍が変更されたかどうかを判定する
   * @param oldBook 古い書籍
   * @param newBook 新しい書籍
   * @returns 変更されたかどうか
   */
  private static isBookChanged(oldBook: Book, newBook: Book): boolean {
    // 実装すべき処理:
    // 1. 重要なフィールドを比較
    // 2. 比較結果を返す
    
    // 重要なフィールドの比較（タイトル、著者、出版社、出版日）
    if (
      oldBook.title !== newBook.title ||
      oldBook.author !== newBook.author ||
      oldBook.publisher !== newBook.publisher ||
      oldBook.publishedDate !== newBook.publishedDate
    ) {
      return true;
    }
    
    // 説明文の比較
    if (
      (oldBook.description || '') !== (newBook.description || '') ||
      (oldBook.tableOfContents || '') !== (newBook.tableOfContents || '')
    ) {
      return true;
    }
    
    // 図書館蔵書情報の比較
    if (this.isLibraryAvailabilityChanged(oldBook, newBook)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 図書館蔵書情報が変更されたかどうかを判定する
   * @param oldBook 古い書籍
   * @param newBook 新しい書籍
   * @returns 変更されたかどうか
   */
  private static isLibraryAvailabilityChanged(oldBook: Book, newBook: Book): boolean {
    // 実装すべき処理:
    // 1. 各図書館の蔵書状況を比較
    // 2. 比較結果を返す
    
    // サイズの比較
    if (oldBook.libraryAvailability.size !== newBook.libraryAvailability.size) {
      return true;
    }
    
    // 各図書館の蔵書状況の比較
    for (const [libraryId, oldAvailability] of oldBook.libraryAvailability) {
      const newAvailability = newBook.libraryAvailability.get(libraryId);
      
      // 新しい方にない場合は変更あり
      if (!newAvailability) {
        return true;
      }
      
      // 蔵書状況の比較
      if (
        oldAvailability.isAvailable !== newAvailability.isAvailable ||
        oldAvailability.opacUrl !== newAvailability.opacUrl
      ) {
        return true;
      }
    }
    
    return false;
  }
}
