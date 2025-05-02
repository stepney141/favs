import { success, failure } from '../../domain/models/valueObjects';
import { BookComparisonService } from '../../domain/services/bookComparisonService';

import type { BookList, BookListDiff } from '../../domain/models/book';
import type { Result} from '../../domain/models/valueObjects';
import type { UseCase } from '../ports/input/useCase';
import type { BookRepository } from '../ports/output/bookRepository';

/**
 * 書籍リスト比較ユースケースのパラメータ
 */
export interface CompareBookListsParams {
  /**
   * 新しい書籍リスト
   */
  newList: BookList;
  
  /**
   * 古い書籍リストの取得パラメータ
   * 省略した場合はリポジトリから取得する
   */
  oldList?: BookList;
  
  /**
   * 比較結果を保存するかどうか
   */
  saveResults?: boolean;
}

/**
 * 書籍リスト比較ユースケース
 * 既存のリストと新しいリストを比較して差分を抽出する
 */
export class CompareBookListsUseCase implements UseCase<CompareBookListsParams, Result<BookListDiff>> {
  constructor(
    private readonly bookRepository: BookRepository
  ) {}
  
  /**
   * ユースケースを実行する
   * @param params パラメータ
   * @returns 比較結果
   */
  async execute(params: CompareBookListsParams): Promise<Result<BookListDiff>> {
    // 実装すべき処理:
    // 1. 古いリストを取得（パラメータで指定されていない場合はリポジトリから）
    // 2. 比較を実行
    // 3. 必要に応じて新しいリストを保存
    // 4. 比較結果を返す
    
    try {
      let oldList: BookList;
      
      // 古いリストがパラメータで指定されていない場合はリポジトリから取得
      if (!params.oldList) {
        const oldListResult = await this.bookRepository.findAll(params.newList.type);
        
        if (oldListResult.type === 'failure') {
          return failure(new Error(`古い書籍リストの取得に失敗しました: ${String(oldListResult.error)}`));
        }
        
        oldList = oldListResult.value;
      } else {
        oldList = params.oldList;
      }
      
      // 比較を実行
      const diff = BookComparisonService.compareBookLists(oldList, params.newList);
      
      // 必要に応じて新しいリストを保存
      if (params.saveResults) {
        const saveResult = await this.bookRepository.save(params.newList);
        
        if (saveResult.type === 'failure') {
          console.warn(`書籍リストの保存に失敗しました: ${String(saveResult.error)}`);
        }
      }
      
      return success(diff);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('書籍リスト比較中に予期しないエラーが発生しました'));
    }
  }
}
