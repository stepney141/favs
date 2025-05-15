// 不要なインポートを削除
// import { isIsbn10, isIsbn13, routeIsbn10, routeIsbn13 } from "@/domain/services/isbnService";

import type { BiblioInfoProvider } from "../ports/output/biblioInfoProvider";
import type { Logger } from "../ports/output/logger";
import type { Book, BookList } from "@/domain/models/book";
import type { AppError } from "@/domain/models/errors";
// Result は不要になったので削除

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
): { execute: (bookList: BookList, signal?: AbortSignal) => Promise<BookList> } {
  // シグネチャと戻り値の型を変更
  // prioritizeProviders 関数は getPriority を使うように変更
  function prioritizeProviders(providers: BiblioInfoProvider[], book: Book): BiblioInfoProvider[] {
    if (!book.identifier) {
      // 識別子がない場合はデフォルトの順序
      return providers;
    }
    return [...providers].sort((a, b) => {
      // getPriority の値が大きいほど優先度が高い（降順ソート）
      // 不要な ! を削除
      return b.getPriority(book.identifier) - a.getPriority(book.identifier);
    });
  }

  /**
   * 実行
   */
  async function execute(bookList: BookList, signal?: AbortSignal): Promise<BookList> {
    // 引数と戻り値の型を変更
    // const { bookList, signal } = params; // 削除

    logger.info(`書誌情報の取得を開始します（${bookList.size}冊）`);

    try {
      // キャンセルチェック
      if (signal?.aborted) {
        const error: AppError = {
          // Error オブジェクトをスロー
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        };
        throw error;
      }

      const enhancedBooks = new Map<string, Book>();

      // 書籍リストを順に処理
      for (const [url, book] of bookList.entries()) {
        // キャンセルチェック
        if (signal?.aborted) {
          const error: AppError = {
            // Error オブジェクトをスロー
            message: "処理がキャンセルされました",
            code: "CANCELLED",
            name: "AppError"
          };
          throw error;
        }

        logger.debug(`書籍を処理しています: ${book.title}`, {
          url,
          identifier: book.identifier,
          title: book.title
        });

        let enhancedBook = book;

        // 適用可能なプロバイダを取得 (supportsIdentifier を使用)
        const applicableProviders = book.identifier
          ? // 不要な ! を削除
            biblioInfoProviders.filter((provider) => provider.supportsIdentifier(book.identifier))
          : []; // 識別子がない場合は適用不可

        // 優先順位を決定
        const prioritizedProviders = prioritizeProviders(applicableProviders, book);

        // 各プロバイダを順に試す
        for (const provider of prioritizedProviders) {
          const providerName = provider.getSourceName(); // getSourceName を使用
          try {
            // APIから情報取得 (enhanceBook を使用)
            const result = await provider.enhanceBook(enhancedBook);

            if (result.isSuccess()) {
              enhancedBook = result.unwrap();
              logger.debug(`${providerName}から書籍情報を取得しました`, {
                // providerName を使用
                identifier: book.identifier,
                title: enhancedBook.title
              });
              // 必須情報が埋まったかチェック (例: title, authors)
              // if (enhancedBook.title && enhancedBook.authors && enhancedBook.authors.length > 0) {
              //   break; // 必須情報が埋まったら抜ける (オプション)
              // }
              break; // 一旦成功したら抜ける
            } else {
              // Resultがエラーの場合もログに記録
              const fetchError = result.unwrapError();
              logger.warn(`${providerName}からの取得でエラー: ${fetchError.message}`, {
                // providerName を使用
                error: fetchError,
                identifier: book.identifier
              });
            }
          } catch (error) {
            // enhanceBook が直接エラーを投げた場合
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`${providerName}からの取得中に予期しないエラー: ${message}`, {
              // providerName を使用
              error,
              identifier: book.identifier
            });
          }

          // キャンセルチェック
          if (signal?.aborted) {
            const error: AppError = {
              // Error オブジェクトをスロー
              message: "処理がキャンセルされました",
              code: "CANCELLED",
              name: "AppError"
            };
            throw error;
          }
        }

        // 結果を保存
        enhancedBooks.set(url, enhancedBook);
      }

      logger.info(`${bookList.size}冊の書誌情報取得が完了しました`);
      return enhancedBooks; // ok(...) の代わりに直接返す
    } catch (thrownError) {
      // 変数名を変更
      // キャンセルエラーの場合
      if (signal?.aborted) {
        const error: AppError = {
          // Error オブジェクトをスロー
          message: "処理がキャンセルされました",
          code: "CANCELLED",
          name: "AppError"
        };
        throw error;
      }

      // AppErrorが投げられた場合
      if (thrownError && typeof thrownError === "object" && "name" in thrownError && thrownError.name === "AppError") {
        const appError = thrownError as AppError;
        logger.error(`書誌情報の取得中にエラーが発生しました: ${appError.message}`, { error: appError });
        throw appError; // そのまま再スロー
      }

      // その他の予期せぬエラー
      const message = thrownError instanceof Error ? thrownError.message : String(thrownError);
      logger.error(`書誌情報の取得中に予期しないエラーが発生しました: ${message}`, { error: thrownError });

      const error: AppError = {
        // Error オブジェクトをスロー
        message: `書誌情報の取得中に予期しないエラーが発生しました: ${message}`,
        code: "UNKNOWN",
        name: "AppError",
        cause: thrownError
      };
      throw error;
    }
  }

  // 公開関数を返す
  return {
    execute
  };
}
