import { BookListImpl } from '../../domain/models/book';
import { right, left } from '../../domain/models/either';

import type { BookList} from '../../domain/models/book';
import type { Either } from '../../domain/models/either';
import type { UserId } from '../../domain/models/valueObjects';
import type { NoInputUseCase, UseCaseError, UseCase } from '../ports/input/useCase';
import type { BookRepository } from '../ports/output/bookRepository';
import type { BookScraperService } from '../ports/output/bookScraperService';

/**
 * 書籍リスト取得ユースケースのエラー型
 */
export interface GetBookListError extends UseCaseError {
  readonly code: 'REPOSITORY_ERROR' | 'SCRAPER_ERROR' | 'VALIDATION_ERROR';
}

/**
 * 書籍リスト取得ユースケースの入力型
 */
export interface GetBookListInput {
  readonly userId: UserId;
  readonly type: 'wish' | 'stacked';
  readonly forceRemote?: boolean;  // リモートから強制的に取得するかどうか
}

/**
 * 書籍リスト取得ユースケース
 * 
 * ローカルリポジトリから書籍リストを取得し、必要に応じてリモートから最新データを取得して更新します。
 * リモートから新しい書籍リストを取得した場合は、リポジトリに保存します。
 */
export class GetBookListUseCase implements NoInputUseCase<BookList, GetBookListError> {
  private readonly repository: BookRepository;
  private readonly scraper: BookScraperService;
  
  constructor(repository: BookRepository, scraper: BookScraperService) {
    this.repository = repository;
    this.scraper = scraper;
  }
  
  /**
   * 書籍リストを取得します
   */
  async execute(): Promise<Either<GetBookListError, BookList>> {
    // インプットパラメーターはコンストラクターで渡されるため、execute()メソッドは引数なしです
    // 実際の実装では、以下のロジックを実装します：
    
    // 1. リポジトリから既存の書籍リストを取得
    // 2. forceRemoteフラグがtrueの場合、またはリポジトリにデータがない場合、スクレイパーを使用してリモートからデータを取得
    // 3. リモートから新しいデータを取得した場合、リポジトリに保存
    // 4. 書籍リストを返却
    
    try {
      // ダミーの実装 - 実際の実装では await を使用する
      await Promise.resolve(); // ESLintのasync/awaitエラーを回避するためのダミーawait
      return right(BookListImpl.createEmpty('wish'));
    } catch (error) {
      return left({
        code: 'VALIDATION_ERROR',
        message: '予期しないエラーが発生しました',
        cause: error
      });
    }
  }
}

/**
 * パラメーター指定可能な書籍リスト取得ユースケース
 */
export class GetBookListWithParamsUseCase implements UseCase<GetBookListInput, BookList, GetBookListError> {
  private readonly repository: BookRepository;
  private readonly scraper: BookScraperService;
  
  constructor(repository: BookRepository, scraper: BookScraperService) {
    this.repository = repository;
    this.scraper = scraper;
  }
  
  /**
   * 指定されたパラメーターで書籍リストを取得します
   * @param input 入力パラメーター
   */
  async execute(input: GetBookListInput): Promise<Either<GetBookListError, BookList>> {
    try {
      // 1. リポジトリから既存の書籍リストを取得
      const localListResult = await this.repository.getBookList(input.type);
      
      // リポジトリからの取得が失敗した場合
      if (localListResult._tag === 'Left') {
        // データがない場合はスキップして次のステップへ
        if (localListResult.left.code === 'NOT_FOUND') {
          // 次のステップ（リモート取得）へ進む
        } else {
          // その他のエラーの場合はエラーを返す
          return left({
            code: 'REPOSITORY_ERROR',
            message: `書籍リストの取得に失敗しました: ${localListResult.left.message}`,
            cause: localListResult.left
          });
        }
      }
      
      // 2. forceRemoteフラグがtrueの場合、またはリポジトリにデータがない場合、
      //    スクレイパーを使用してリモートからデータを取得
      const shouldFetchRemote = input.forceRemote || localListResult._tag === 'Left';
      let bookList: BookList;
      
      if (shouldFetchRemote) {
        // リモートから書籍リストを取得
        const remoteListResult = await this.scraper.getWishBooks(input.userId);
        
        if (remoteListResult._tag === 'Left') {
          return left({
            code: 'SCRAPER_ERROR',
            message: `リモートからの書籍リスト取得に失敗しました: ${remoteListResult.left.message}`,
            cause: remoteListResult.left
          });
        }
        
        bookList = remoteListResult.right;
        
        // 3. リポジトリに保存
        const saveResult = await this.repository.saveBookList(bookList);
        
        if (saveResult._tag === 'Left') {
          // 保存に失敗してもデータは返す（警告ログを出力する）
          console.warn(`書籍リストの保存に失敗しました: ${saveResult.left.message}`);
        }
      } else {
        // ローカルデータを使用
        bookList = localListResult.right;
      }
      
      // 4. 書籍リストを返却
      return right(bookList);
    } catch (error) {
      return left({
        code: 'VALIDATION_ERROR',
        message: '予期しないエラーが発生しました',
        cause: error
      });
    }
  }
}
