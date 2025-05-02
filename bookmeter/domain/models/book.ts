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
  readonly publisher: string;
  readonly publishedDate: string;
  
  // オプション情報
  readonly description?: string;
  readonly tableOfContents?: string;
  
  // 図書館蔵書情報
  readonly libraryAvailability: Map<LibraryId, LibraryAvailability>;
}

/**
 * 図書館での蔵書状況
 */
export interface LibraryAvailability {
  readonly isAvailable: boolean;
  readonly opacUrl?: string;
}

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
   * @returns 書籍（存在しない場合はundefined）
   */
  get(isbn: string): Book | undefined;
  
  /**
   * ISBNの配列を取得
   * @returns ISBNの配列
   */
  getIsbns(): string[];
  
  /**
   * Iterable プロトコルをサポート
   */
  [Symbol.iterator](): IterableIterator<[string, Book]>;
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
  static fromMap(items: Map<string, Book>, type: 'wish' | 'stacked'): BookList {
    return new BookListImpl(new Map(items), type);
  }
  
  /**
   * 配列から書籍リストを作成
   * @param books 書籍の配列
   * @param type リストの種類
   * @returns 書籍リスト
   */
  static fromArray(books: Book[], type: 'wish' | 'stacked'): BookList {
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
  
  get(isbn: string): Book | undefined {
    return this.items.get(isbn);
  }
  
  getIsbns(): string[] {
    return [...this.items.keys()];
  }
  
  [Symbol.iterator](): IterableIterator<[string, Book]> {
    return this.items.entries();
  }
}

/**
 * 書籍リストの差分
 */
export interface BookListDiff {
  readonly added: Book[];
  readonly removed: Book[];
  readonly changed: Array<{
    readonly old: Book;
    readonly new: Book;
  }>;
}
