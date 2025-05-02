import { failure } from '../../domain/models/valueObjects';

import type { BookList } from '../../domain/models/book';
import type { BookListType, Result, UserId} from '../../domain/models/valueObjects';
import type { UseCase } from '../ports/input/useCase';
import type { BookRepository } from '../ports/output/bookRepository';
import type { BookScraperService } from '../ports/output/bookScraperService';


/**
 * 書籍リスト取得ユースケースの入力パラメータ
 */
export interface GetBookListParams {
  /**
   * 取得する書籍リストの種類
   */
  type: BookListType;
  
  /**
   * ユーザーID
   */
  userId: UserId;
  
  /**
   * リフレッシュするかどうか
   * trueの場合、キャッシュではなく常に最新のデータを取得する
   */
  refresh?: boolean;
  
  /**
   * ログインするかどうか
   * trueの場合、スクレイピング前にログインを試みる
   */
  doLogin?: boolean;
  
  /**
   * ログイン情報
   */
  credentials?: {
    username: string;
    password: string;
  };
}

/**
 * 書籍リスト取得ユースケース
 * リポジトリからの取得を試み、存在しない場合やリフレッシュ要求がある場合はスクレイピングで取得する
 */
export class GetBookListUseCase implements UseCase<GetBookListParams, Result<BookList>> {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly bookScraper: BookScraperService
  ) {}
  
  /**
   * ユースケースを実行する
   * @param params パラメータ
   * @returns 書籍リスト
   */
  async execute(params: GetBookListParams): Promise<Result<BookList>> {
    // 実装すべき処理:
    // 1. リフレッシュ要求がない場合、リポジトリから書籍リストを取得を試みる
    // 2. 書籍リストが存在しない場合や、リフレッシュ要求がある場合はスクレイピングで取得
    // 3. ログイン要求がある場合はログインする
    // 4. 書籍リストを返す
    
    try {
      // リフレッシュ要求がない場合はリポジトリから取得を試みる
      if (!params.refresh) {
        const existsResult = await this.bookRepository.exists(params.type);
        
        if (existsResult.type === 'success' && existsResult.value) {
          const storedBooksResult = await this.bookRepository.findAll(params.type);
          
          if (storedBooksResult.type === 'success' && storedBooksResult.value.size() > 0) {
            return storedBooksResult;
          }
        }
      }
      
      // スクレイパーの初期化
      const initResult = await this.bookScraper.initialize();
      if (initResult.type === 'failure') {
        return failure(new Error(`スクレイパーの初期化に失敗しました: ${initResult.error}`));
      }
      
      // ログイン要求がある場合はログイン
      if (params.doLogin && params.credentials) {
        const loginResult = await this.bookScraper.login(
          params.credentials.username,
          params.credentials.password
        );
        
        if (loginResult.type === 'failure') {
          await this.bookScraper.dispose();
          return failure(new Error(`ログインに失敗しました: ${loginResult.error}`));
        }
      }
      
      // 書籍リストをスクレイピングで取得
      let scrapedBooksResult: Result<BookList>;
      
      if (params.type === 'wish') {
        scrapedBooksResult = await this.bookScraper.getWishBooks(params.userId);
      } else {
        scrapedBooksResult = await this.bookScraper.getStackedBooks(params.userId);
      }
      
      // スクレイパーのリソースを解放
      await this.bookScraper.dispose();
      
      if (scrapedBooksResult.type === 'failure') {
        return failure(new Error(`書籍リストの取得に失敗しました: ${scrapedBooksResult.error}`));
      }
      
      // 取得した書籍リストをリポジトリに保存
      const saveResult = await this.bookRepository.save(scrapedBooksResult.value);
      
      if (saveResult.type === 'failure') {
        console.warn(`書籍リストの保存に失敗しました: ${saveResult.error}`);
      }
      
      return scrapedBooksResult;
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('書籍リスト取得中に予期しないエラーが発生しました'));
    }
  }
}

/**
 * 読みたい本リスト取得ユースケース
 */
export class GetWishBookListUseCase extends GetBookListUseCase {
  constructor(
    bookRepository: BookRepository,
    bookScraper: BookScraperService
  ) {
    super(bookRepository, bookScraper);
  }
  
  /**
   * ユースケースを実行する
   * @param params パラメータ
   * @returns 読みたい本リスト
   */
  async execute(params: Omit<GetBookListParams, 'type'>): Promise<Result<BookList>> {
    return super.execute({ ...params, type: 'wish' });
  }
}

/**
 * 積読本リスト取得ユースケース
 */
export class GetStackedBookListUseCase extends GetBookListUseCase {
  constructor(
    bookRepository: BookRepository,
    bookScraper: BookScraperService
  ) {
    super(bookRepository, bookScraper);
  }
  
  /**
   * ユースケースを実行する
   * @param params パラメータ
   * @returns 積読本リスト
   */
  async execute(params: Omit<GetBookListParams, 'type'>): Promise<Result<BookList>> {
    return super.execute({ ...params, type: 'stacked' });
  }
}
