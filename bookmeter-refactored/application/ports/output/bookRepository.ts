import type { BookList, BookListType } from "@/domain/models/book";
import type { DatabaseError } from "@/domain/models/errors";
import type { BookId } from "@/domain/models/isbn";
import type { Result } from "@/domain/models/result";

/**
 * 書籍リポジトリのポート
 * 書籍データの永続化と取得を担当
 */
export interface BookRepository {
  /**
   * 指定したタイプ（読みたい本・積読本）の書籍リストをすべて取得
   * @param type 書籍リストのタイプ（wish または stacked）
   * @returns 書籍リスト
   */
  findAll(type: BookListType): Promise<Result<DatabaseError, BookList>>;

  /**
   * 指定したIDの書籍を取得
   * @param id 書籍ID
   * @returns 書籍（存在しない場合はnull）
   */
  findById(id: BookId): Promise<Result<DatabaseError, BookList | null>>;

  /**
   * 書籍リストを保存
   * @param books 書籍リスト
   * @param type 書籍リストのタイプ（wish または stacked）
   * @returns 成功時はvoid、失敗時はDatabaseError
   */
  save(books: BookList, type: BookListType): Promise<Result<DatabaseError, void>>;

  /**
   * 指定した書籍の説明が存在するかどうかを確認
   * @param id 書籍ID
   * @returns 説明が存在するかどうか
   */
  hasDescription(id: BookId): Promise<Result<DatabaseError, boolean>>;

  /**
   * 指定した書籍の説明を更新
   * @param id 書籍ID
   * @param description 説明文
   * @returns 成功時はvoid、失敗時はDatabaseError
   */
  updateDescription(id: BookId, description: string): Promise<Result<DatabaseError, void>>;
}
