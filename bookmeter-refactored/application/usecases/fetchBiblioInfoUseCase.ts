import { ok, err } from '../../domain/models/result';
import { isIsbn10, isJapaneseBook } from '../../domain/services/isbnService';


import type { Book, BookList } from '../../domain/models/book';
import type { AppError } from '../../domain/models/errors';
import type { Result} from '../../domain/models/result';
import type { BiblioInfoProvider } from '../ports/output/biblioInfoProvider';
import type { Logger } from '../ports/output/logger';

export interface FetchBiblioInfoParams {
  bookList: BookList;
  signal?: AbortSignal;
}

/**
 * 書誌情報を取得するユースケース
 */
export function createFetchBiblioInfoUseCase(
  biblioInfoProviders: BiblioInfoProvider[],
  logger: Logger
): { execute: (params: FetchBiblioInfoParams) => Promise<Result<AppError, BookList>> } {
  /**
   * 書籍に基づいてプロバイダの優先順位を決定
   */
  function prioritizeProviders(
    providers: BiblioInfoProvider[], 
    book: Book
  ): BiblioInfoProvider[] {
    // 書籍のISBNから日本の書籍かを判定
    const isJapanese = typeof book.identifier === 'string' && 
                       isIsbn10(book.identifier) && 
                       isJapaneseBook(book.identifier);
    
    // 日本の書籍の場合の優先順位: OpenBD, NDL, ISBNdb, GoogleBooks
    // 海外の書籍の場合の優先順位: ISBNdb, GoogleBooks, OpenBD, NDL
    return [...providers].sort((a, b) => {
      if (isJapanese) {
        if (a.source === 'OpenBD') return -1;
        if (b.source === 'OpenBD') return 1;
        if (a.source === 'NDL') return -1;
        if (b.source === 'NDL') return 1;
      } else {
        if (a.source === 'ISBNdb') return -1;
        if (b.source === 'ISBNdb') return 1;
        if (a.source === 'GoogleBooks') return -1;
        if (b.source === 'GoogleBooks') return 1;
      }
      return 0;
    });
  }

  /**
   * 実行
   */
  async function execute(
    params: FetchBiblioInfoParams
  ): Promise<Result<AppError, BookList>> {
    const { bookList, signal } = params;
    
    logger.info(`書誌情報の取得を開始します（${bookList.size}冊）`);
    
    try {
      // キャンセルチェック
      if (signal?.aborted) {
        return err({
          message: '処理がキャンセルされました',
          code: 'CANCELLED',
          name: 'AppError'
        });
      }
      
      const enhancedBooks = new Map<string, Book>();
      
      // 書籍リストを順に処理
      for (const [url, book] of bookList.entries()) {
        // キャンセルチェック
        if (signal?.aborted) {
          return err({
            message: '処理がキャンセルされました',
            code: 'CANCELLED',
            name: 'AppError'
          });
        }
        
        logger.debug(`書籍を処理しています: ${book.title}`, { 
          url, 
          identifier: book.identifier,
          title: book.title 
        });
        
        let enhancedBook = book;
        
        // 適用可能なプロバイダを取得
        const applicableProviders = biblioInfoProviders
          .filter(provider => provider.isApplicable(book));
        
        // 日本の書籍かどうかに基づいてプロバイダの優先順位を決定
        const prioritizedProviders = prioritizeProviders(applicableProviders, book);
        
        // 各プロバイダを順に試す
        for (const provider of prioritizedProviders) {
          try {
            // APIから情報取得
            const result = await provider.fetchInfo(enhancedBook);
            
            if (result.isSuccess()) {
              enhancedBook = result.unwrap();
              logger.debug(`${provider.source}から書籍情報を取得しました`, { 
                identifier: book.identifier,
                title: enhancedBook.title 
              });
              break; // 成功したらループを抜ける
            }
          } catch (error) {
            // エラーをログに記録して次のプロバイダに進む
            logger.warn(`${provider.source}からの取得に失敗しました`, { 
              error, 
              identifier: book.identifier 
            });
          }
          
          // キャンセルチェック
          if (signal?.aborted) {
            return err({
              message: '処理がキャンセルされました',
              code: 'CANCELLED',
              name: 'AppError'
            });
          }
        }
        
        // 結果を保存
        enhancedBooks.set(url, enhancedBook);
      }
      
      logger.info(`${bookList.size}冊の書誌情報取得が完了しました`);
      return ok(enhancedBooks);
    } catch (error) {
      // キャンセルエラーの場合
      if (signal?.aborted) {
        return err({
          message: '処理がキャンセルされました',
          code: 'CANCELLED',
          name: 'AppError'
        });
      }
      
      // その他のエラー
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`書誌情報の取得中にエラーが発生しました: ${message}`, { error });
      
      return err({
        message: `書誌情報の取得中にエラーが発生しました: ${message}`,
        code: 'UNKNOWN',
        name: 'AppError',
        cause: error
      });
    }
  }

  // 公開関数を返す
  return {
    execute
  };
}
