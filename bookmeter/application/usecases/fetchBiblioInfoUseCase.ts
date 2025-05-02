import { failure, success } from '../../domain/models/valueObjects';

import type { Book } from '../../domain/models/book';
import type { Result} from '../../domain/models/valueObjects';
import type { UseCase } from '../ports/input/useCase';
import type { BiblioInfoProviderAggregator } from '../ports/output/biblioInfoProvider';

/**
 * 書誌情報取得ユースケースの入力パラメータ
 */
export interface FetchBiblioInfoParams {
  /**
   * 対象の書籍
   */
  book: Book;
  
  /**
   * APIキー（必要な場合）
   */
  apiKeys?: Record<string, string>;
}

/**
 * 書誌情報取得ユースケース
 * 複数のソースから書籍の詳細情報を取得し、マージする
 */
export class FetchBiblioInfoUseCase implements UseCase<FetchBiblioInfoParams, Result<Book>> {
  constructor(
    private readonly biblioInfoProviders: BiblioInfoProviderAggregator
  ) {}
  
  /**
   * ユースケースを実行する
   * @param params パラメータ
   * @returns 書籍情報
   */
  async execute(params: FetchBiblioInfoParams): Promise<Result<Book>> {
    // 実装すべき処理:
    // 1. 書籍のISBNを検証
    // 2. 複数のプロバイダーを使って書誌情報を取得
    // 3. 取得した情報をマージして返す
    
    try {
      const enrichedBookResult = await this.biblioInfoProviders.enrichBook(params.book);
      
      if (enrichedBookResult.type === 'failure') {
        return failure(new Error(`書誌情報の取得に失敗しました: ${enrichedBookResult.error}`));
      }
      
      return success(enrichedBookResult.value);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('書誌情報取得中に予期しないエラーが発生しました'));
    }
  }
}

/**
 * 書籍リストの書誌情報を一括取得するユースケース
 */
export class FetchBiblioInfoBatchUseCase implements UseCase<{ books: Book[], apiKeys?: Record<string, string> }, Result<Book[]>> {
  constructor(
    private readonly fetchBiblioInfoUseCase: FetchBiblioInfoUseCase
  ) {}
  
  /**
   * ユースケースを実行する
   * @param params パラメータ
   * @returns 書籍情報の配列
   */
  async execute(params: { books: Book[], apiKeys?: Record<string, string> }): Promise<Result<Book[]>> {
    // 実装すべき処理:
    // 1. 各書籍に対して並行して書誌情報を取得
    // 2. 結果をまとめて返す
    
    try {
      const enrichedBooks: Book[] = [];
      const errors: Error[] = [];
      
      // 並行処理するが、レート制限に注意する必要がある
      // 実際の実装では適切なバッチサイズと待機時間を設定する
      const batchSize = 5;
      
      for (let i = 0; i < params.books.length; i += batchSize) {
        const batch = params.books.slice(i, i + batchSize);
        const promises = batch.map(book => 
          this.fetchBiblioInfoUseCase.execute({ book, apiKeys: params.apiKeys })
        );
        
        const results = await Promise.all(promises);
        
        for (const result of results) {
          if (result.type === 'success') {
            enrichedBooks.push(result.value);
          } else {
            errors.push(result.error);
          }
        }
        
        // APIレート制限回避のための待機
        if (i + batchSize < params.books.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (errors.length > 0) {
        console.warn(`${errors.length}件の書籍で書誌情報の取得に失敗しました`);
      }
      
      return success(enrichedBooks);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('書誌情報一括取得中に予期しないエラーが発生しました'));
    }
  }
}
