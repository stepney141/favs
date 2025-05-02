import type { BookList } from '../../../domain/models/book';
import type { BookListType, Result } from '../../../domain/models/valueObjects';

/**
 * 書籍リポジトリインターフェース
 * データストレージとの連携を抽象化
 */
export interface BookRepository {
  /**
   * 指定した種類の書籍リストを取得する
   * @param type 書籍リストの種類（wish/stacked）
   * @returns 書籍リストの取得結果
   */
  findAll(type: BookListType): Promise<Result<BookList>>;
  
  /**
   * 指定した種類の書籍リストを保存する
   * @param books 保存する書籍リスト
   * @returns 保存結果
   */
  save(books: BookList): Promise<Result<void>>;
  
  /**
   * 書籍リストが存在するかどうかを確認する
   * @param type 書籍リストの種類（wish/stacked）
   * @returns 存在確認結果
   */
  exists(type: BookListType): Promise<Result<boolean>>;
  
  /**
   * 書籍リストをエクスポートする
   * @param books 書籍リスト
   * @param path 出力先パス
   * @returns エクスポート結果
   */
  export(books: BookList, path: string): Promise<Result<void>>;
}
