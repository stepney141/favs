import { right, left } from '../../domain/models/either';
import { BookComparisonService } from '../../domain/services/bookComparisonService';

import type { BookList, BookListDiff } from '../../domain/models/book';
import type { Either } from '../../domain/models/either';
import type { UseCase, UseCaseError } from '../ports/input/useCase';

/**
 * 書籍リスト比較ユースケースのエラー型
 */
export interface CompareBookListsError extends UseCaseError {
  readonly code: 'VALIDATION_ERROR' | 'COMPARISON_ERROR';
}

/**
 * 書籍リスト比較ユースケースの入力型
 */
export interface CompareBookListsInput {
  readonly oldList: BookList;
  readonly newList: BookList;
  readonly includeDetails?: boolean; // 詳細な差分情報を含めるかどうか
}

/**
 * 書籍リスト比較ユースケースの出力型
 */
export interface CompareBookListsOutput {
  readonly diff: BookListDiff;
  readonly summary: string;
  readonly hasChanges: boolean;
  readonly details?: {
    readonly added: Array<{ isbn: string; title: string }>;
    readonly removed: Array<{ isbn: string; title: string }>;
    readonly changed: Array<{ isbn: string; oldTitle: string; newTitle: string }>;
  };
}

/**
 * 書籍リスト比較ユースケース
 * 
 * 二つの書籍リストを比較し、差分情報を返却します。
 * 詳細な差分情報も任意で取得できます。
 */
export class CompareBookListsUseCase implements UseCase<CompareBookListsInput, CompareBookListsOutput, CompareBookListsError> {
  /**
   * 指定された二つの書籍リストを比較します
   * @param input 入力パラメーター
   */
  async execute(input: CompareBookListsInput): Promise<Either<CompareBookListsError, CompareBookListsOutput>> {
    try {
      await Promise.resolve(); // ESLintのasync/awaitエラーを回避するためのダミーawait
      
      // 1. 書籍リストの差分を計算
      const diff = BookComparisonService.compareBookLists(input.oldList, input.newList);
      
      // 2. 変更があるかどうかを判定
      const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
      
      // 3. 差分の概要を取得
      const summary = BookComparisonService.getDiffSummary(diff);
      
      // 4. 詳細情報を取得（オプション）
      const details = input.includeDetails 
        ? BookComparisonService.getDiffDetails(diff)
        : undefined;
      
      // 5. 結果を返却
      return right({
        diff,
        summary,
        hasChanges,
        details
      });
    } catch (error) {
      return left({
        code: 'COMPARISON_ERROR',
        message: '書籍リストの比較中にエラーが発生しました',
        cause: error
      });
    }
  }
}

/**
 * 書籍リストに変更があるかどうかを判定するユースケース
 */
export class HasBookListChangesUseCase implements UseCase<CompareBookListsInput, boolean, CompareBookListsError> {
  /**
   * 指定された二つの書籍リストに変更があるかどうかを判定します
   * @param input 入力パラメーター
   */
  async execute(input: CompareBookListsInput): Promise<Either<CompareBookListsError, boolean>> {
    try {
      await Promise.resolve(); // ESLintのasync/awaitエラーを回避するためのダミーawait
      
      // BookComparisonServiceを使用して変更があるかどうかを判定
      const hasChanges = BookComparisonService.hasChanges(input.oldList, input.newList);
      
      return right(hasChanges);
    } catch (error) {
      return left({
        code: 'VALIDATION_ERROR',
        message: '書籍リストの変更検出中にエラーが発生しました',
        cause: error
      });
    }
  }
}
