import { fromNullable, isSome } from './option';

import type { Option} from './option';
import type { ISBN10, ISBN13, ASIN, BookId, LibraryId } from './valueObjects';

/**
 * 書籍エンティティ
 * 書籍の基本情報を格納する
 */
export interface Book {
  // 識別子
  readonly id: BookId;
  readonly bookmeterUrl: string;
  readonly isbn: ISBN10 | ISBN13 | ASIN;
  
  // 基本情報
  readonly title: string;
  readonly author: string;
  readonly publisher: Option<string>;  // Option型に変更
  readonly publishedDate: Option<string>;  // Option型に変更
  
  // オプション情報
  readonly description: Option<string>;  // Option型に変更
  readonly tableOfContents: Option<string>;  // Option型に変更
  
  // 図書館蔵書情報
  readonly libraryAvailability: ReadonlyMap<LibraryId, LibraryAvailability>;
}

/**
 * 図書館での蔵書状況
 */
export interface LibraryAvailability {
  readonly isAvailable: boolean;
  readonly opacUrl: Option<string>;  // Option型に変更
}

/**
 * 書籍のファクトリ関数
 */
export const createBook = (
  id: BookId,
  bookmeterUrl: string,
  isbn: ISBN10 | ISBN13 | ASIN,
  title: string,
  author: string,
  publisher?: string | null,
  publishedDate?: string | null,
  description?: string | null,
  tableOfContents?: string | null,
  libraryAvailability?: ReadonlyMap<LibraryId, LibraryAvailability>
): Book => ({
  id,
  bookmeterUrl,
  isbn,
  title,
  author,
  publisher: fromNullable(publisher),
  publishedDate: fromNullable(publishedDate),
  description: fromNullable(description),
  tableOfContents: fromNullable(tableOfContents),
  libraryAvailability: libraryAvailability || new Map()
});

/**
 * 書籍を更新する純粋関数
 */
export const updateBook = (book: Book, updates: Partial<Omit<Book, 'id' | 'isbn' | 'bookmeterUrl'>>): Book => ({
  ...book,
  ...updates
});

/**
 * 出版社情報を設定する
 */
export const setPublisher = (book: Book, publisher: string | null | undefined): Book => ({
  ...book,
  publisher: fromNullable(publisher)
});

/**
 * 出版日を設定する
 */
export const setPublishedDate = (book: Book, date: string | null | undefined): Book => ({
  ...book,
  publishedDate: fromNullable(date)
});

/**
 * 説明を設定する
 */
export const setDescription = (book: Book, description: string | null | undefined): Book => ({
  ...book,
  description: fromNullable(description)
});

/**
 * 目次を設定する
 */
export const setTableOfContents = (book: Book, toc: string | null | undefined): Book => ({
  ...book,
  tableOfContents: fromNullable(toc)
});

/**
 * 図書館の情報を追加する
 */
export const addLibraryAvailability = (
  book: Book, 
  libraryId: LibraryId, 
  isAvailable: boolean, 
  opacUrl?: string | null
): Book => {
  const newAvailabilities = new Map(book.libraryAvailability);
  newAvailabilities.set(libraryId, {
    isAvailable,
    opacUrl: fromNullable(opacUrl)
  });
  
  return {
    ...book,
    libraryAvailability: newAvailabilities
  };
};

/**
 * 書籍リスト
 * ISBNをキーとして書籍を管理する
 */
export interface BookList {
  readonly items: ReadonlyMap<string, Book>;
  readonly type: 'wish' | 'stacked';
  
  /**
   * サイズを取得
   */
  size(): number;
  
  /**
   * 書籍を追加
   * @param book 追加する書籍
   * @returns 新しい書籍リスト
   */
  add(book: Book): BookList;
  
  /**
   * 書籍を削除
   * @param isbn ISBN
   * @returns 新しい書籍リスト
   */
  remove(isbn: string): BookList;
  
  /**
   * 書籍を取得
   * @param isbn ISBN
   * @returns 書籍（存在しない場合はnone）
   */
  get(isbn: string): Option<Book>;
  
  /**
   * ISBNの配列を取得
   * @returns ISBNの配列
   */
  getIsbns(): readonly string[];
  
  /**
   * Iterable プロトコルをサポート
   */
  [Symbol.iterator](): IterableIterator<[string, Book]>;
  
  /**
   * リスト内の全書籍に関数を適用して新しいリストを作成
   * @param f 各書籍に適用する関数
   * @returns 新しい書籍リスト
   */
  map(f: (book: Book) => Book): BookList;
  
  /**
   * 条件を満たす書籍のみを含む新しいリストを作成
   * @param predicate フィルタ条件
   * @returns 新しい書籍リスト
   */
  filter(predicate: (book: Book) => boolean): BookList;
}

/**
 * 書籍リストの実装
 */
export class BookListImpl implements BookList {
  private constructor(
    public readonly items: ReadonlyMap<string, Book>,
    public readonly type: 'wish' | 'stacked'
  ) {}
  
  /**
   * 空の書籍リストを作成
   * @param type リストの種類
   * @returns 空の書籍リスト
   */
  static createEmpty(type: 'wish' | 'stacked'): BookList {
    return new BookListImpl(new Map<string, Book>(), type);
  }
  
  /**
   * Mapから書籍リストを作成
   * @param items 書籍のMap
   * @param type リストの種類
   * @returns 書籍リスト
   */
  static fromMap(items: Map<string, Book> | ReadonlyMap<string, Book>, type: 'wish' | 'stacked'): BookList {
    return new BookListImpl(new Map(items), type);
  }
  
  /**
   * 配列から書籍リストを作成
   * @param books 書籍の配列
   * @param type リストの種類
   * @returns 書籍リスト
   */
  static fromArray(books: readonly Book[], type: 'wish' | 'stacked'): BookList {
    const map = new Map<string, Book>();
    for (const book of books) {
      map.set(book.isbn.toString(), book);
    }
    return new BookListImpl(map, type);
  }
  
  size(): number {
    return this.items.size;
  }
  
  add(book: Book): BookList {
    const newMap = new Map(this.items);
    newMap.set(book.isbn.toString(), book);
    return new BookListImpl(newMap, this.type);
  }
  
  remove(isbn: string): BookList {
    const newMap = new Map(this.items);
    newMap.delete(isbn);
    return new BookListImpl(newMap, this.type);
  }
  
  get(isbn: string): Option<Book> {
    const book = this.items.get(isbn);
    return fromNullable(book);
  }
  
  getIsbns(): readonly string[] {
    return [...this.items.keys()];
  }
  
  [Symbol.iterator](): IterableIterator<[string, Book]> {
    return this.items.entries();
  }
  
  map(f: (book: Book) => Book): BookList {
    const newItems = new Map<string, Book>();
    for (const [isbn, book] of this.items) {
      newItems.set(isbn, f(book));
    }
    return new BookListImpl(newItems, this.type);
  }
  
  filter(predicate: (book: Book) => boolean): BookList {
    const newItems = new Map<string, Book>();
    for (const [isbn, book] of this.items) {
      if (predicate(book)) {
        newItems.set(isbn, book);
      }
    }
    return new BookListImpl(newItems, this.type);
  }
}

/**
 * 書籍リストの差分
 */
export interface BookListDiff {
  readonly added: readonly Book[];
  readonly removed: readonly Book[];
  readonly changed: readonly {
    readonly old: Book;
    readonly new: Book;
  }[];
  readonly unchanged: readonly Book[];
}

/**
 * 2つの書籍リストの差分を計算する純粋関数
 */
export const diffBookLists = (oldList: BookList, newList: BookList): BookListDiff => {
  const added: Book[] = [];
  const removed: Book[] = [];
  const changed: Array<{ old: Book, new: Book }> = [];
  const unchanged: Book[] = [];
  
  // 削除されたものを検出
  for (const [isbn, oldBook] of oldList) {
    const newBookOption = newList.get(isbn);
    if (!isSome(newBookOption)) {
      removed.push(oldBook);
    }
  }
  
  // 追加されたものと変更されたものを検出
  for (const [isbn, newBook] of newList) {
    const oldBookOption = oldList.get(isbn);
    
    if (!isSome(oldBookOption)) {
      added.push(newBook);
    } else {
      const oldBook = oldBookOption.value;
      // 書籍の内容が変更されたかどうかの判定 (簡易版)
      if (
        oldBook.title !== newBook.title ||
        oldBook.author !== newBook.author
      ) {
        changed.push({ old: oldBook, new: newBook });
      } else {
        unchanged.push(newBook);
      }
    }
  }
  
  return {
    added,
    removed,
    changed,
    unchanged
  };
};
