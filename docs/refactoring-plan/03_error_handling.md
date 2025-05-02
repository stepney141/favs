# 統一的なエラーハンドリング

## 現状の問題点

現在のbookmeterプロジェクトでは、エラーハンドリングが一貫しておらず、以下のような問題が生じています：

### 1. エラー処理の不統一

- 各モジュール、各関数でエラー処理方法が異なっている
- エラーの種類に応じた適切な処理が欠けている
- エラー情報が十分に保持・伝播されていない

```typescript
// fetchers.ts - 特定の文字列を設定するパターン
try {
  // APIリクエスト処理
} catch (error) {
  logAxiosError(error, "OpenBD", `ISBN: ${isbn}`);
  const statusText: BiblioinfoErrorStatus = "OpenBD_API_Error";
  const part = {
    book_title: statusText,
    author: statusText,
    publisher: statusText,
    published_date: statusText
  };
  return {
    book: { ...book, ...part },
    isFound: false
  };
}

// index.ts - エラーを出力して終了するパターン
try {
  // 様々な処理
} catch (e) {
  if (isAxiosError(e)) {
    const { status, message } = e;
    console.error(`Error: ${status} ${message}`);
  } else {
    console.log(e);
  }
  process.exit(1); // プロセスを終了
}

// sqlite.ts - トランザクションロールバックパターン
try {
  // DBトランザクション処理
} catch (error) {
  console.error(`${JOB_NAME}: データベース操作中にエラーが発生しました:`, error);
  await db.run("ROLLBACK");
  throw error; // エラーを再スロー
}
```

### 2. 回復戦略の欠如

- 一時的なエラーに対するリトライ機構がない
- エラー発生時の代替処理パスが明確でない
- 重大なエラーと軽微なエラーの区別がない

```typescript
// kinokuniya.ts - エラー発生時の単純な空文字列返却
async function getBookDetails(page: Page, bookUrl: string): Promise<string> {
  try {
    // ブラウザ操作とデータ取得
    return description.trim();
  } catch (error) {
    console.error(`説明の取得に失敗しました: ${bookUrl}`, error);
    return ""; // エラー時は空文字列を返すだけ
  }
}
```

### 3. エラー情報の喪失

- エラーのコンテキスト情報が失われている
- エラーメッセージがユーザーフレンドリーでない
- スタックトレースが適切に保持されていない

```typescript
// logAxiosError関数の例
function logAxiosError(error: unknown, apiName: string, context?: string): void {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError;
    console.error(
      `${JOB_NAME}: ${apiName} APIエラー` +
        (context ? ` (${context})` : "") +
        `: ${axiosError.message}` +
        (axiosError.response ? ` [Status: ${axiosError.response.status}]` : "") +
        (axiosError.config?.url ? ` [URL: ${axiosError.config.url}]` : "")
    );
  } else {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${JOB_NAME}: ${apiName} Unknown error: ${errorMessage}`);
  }
  // エラー情報がログに出力されるだけで、呼び出し元に戻されない
}
```

### 4. エラー型の不足

- 具体的なエラータイプが定義されていない
- 文字列ベースのエラーコードに依存している
- 型安全なエラーハンドリングができない

```typescript
// types.ts - エラー状態を文字列で表現
export type BiblioinfoErrorStatus =
  | `Not_found_in_${(typeof BIBLIOINFO_SOURCES)[number]}`
  | "INVALID_ISBN"
  | "OpenBD_API_ERROR"
  | "ISBNdb_API_ERROR"
  | "NDL_API_ERROR"
  | "GoogleBooks_API_ERROR";
```

## 提案する改善策

### 1. カスタムエラークラス階層の導入

アプリケーション固有のエラータイプを定義し、階層構造を持たせることで、より詳細なエラーハンドリングを可能にします。

```typescript
// domain/errors/index.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Error stacktraceを保持する (Node.js v10以降)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// domain/errors/apiError.ts
export class ApiError extends AppError {
  constructor(
    message: string,
    public readonly statusCode: number | undefined,
    public readonly endpoint: string,
    cause?: unknown
  ) {
    super(message, `API_ERROR_${statusCode || 'UNKNOWN'}`, cause);
  }
  
  get isNetworkError(): boolean {
    return !this.statusCode;
  }
  
  get isClientError(): boolean {
    return !!this.statusCode && this.statusCode >= 400 && this.statusCode < 500;
  }
  
  get isServerError(): boolean {
    return !!this.statusCode && this.statusCode >= 500;
  }
  
  get isRetryable(): boolean {
    return this.isNetworkError || this.isServerError || this.statusCode === 429;
  }
}

// domain/errors/scrapingError.ts
export class ScrapingError extends AppError {
  constructor(
    message: string,
    public readonly url: string,
    public readonly selector?: string,
    cause?: unknown
  ) {
    super(message, "SCRAPING_ERROR", cause);
  }
}

// domain/errors/databaseError.ts
export class DatabaseError extends AppError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly tableName?: string,
    cause?: unknown
  ) {
    super(message, "DATABASE_ERROR", cause);
  }
}

// domain/errors/validationError.ts
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value?: unknown,
    cause?: unknown
  ) {
    super(message, "VALIDATION_ERROR", cause);
  }
}
```

### 2. 集中型エラーハンドリングの実装

エラー処理ロジックを一元化することで、一貫したエラーハンドリングを実現します。

```typescript
// infrastructure/error/errorHandler.ts
export class ErrorHandler {
  constructor(private readonly logger: Logger) {}

  handle(error: unknown, context?: string): never {
    // エラーの種類を特定
    const appError = this.normalizeError(error, context);
    
    // エラーをログに記録
    this.logError(appError, context);
    
    // エラーの種類に応じた振る舞い
    this.executeErrorStrategy(appError);
    
    // 常に例外を再スロー（呼び出し側での明示的なハンドリングを強制）
    throw appError;
  }
  
  private normalizeError(error: unknown, context?: string): AppError {
    // 既にAppErrorのサブクラスの場合はそのまま返す
    if (error instanceof AppError) {
      return error;
    }
    
    // AxiosErrorの場合はApiErrorに変換
    if (isAxiosError(error)) {
      const statusCode = error.response?.status;
      const url = error.config?.url || 'unknown-endpoint';
      const message = error.response?.data?.message || error.message;
      
      return new ApiError(
        `API request failed${context ? ` (${context})` : ''}: ${message}`,
        statusCode,
        url,
        error
      );
    }
    
    // 一般的なErrorの場合
    if (error instanceof Error) {
      return new AppError(
        error.message,
        'UNKNOWN_ERROR',
        error
      );
    }
    
    // その他の値の場合
    return new AppError(
      `Unexpected error${context ? ` in ${context}` : ''}: ${String(error)}`,
      'UNKNOWN_ERROR',
      error
    );
  }
  
  private logError(error: AppError, context?: string): void {
    const logData = {
      errorName: error.name,
      errorCode: error.code,
      context,
      ...(error instanceof ApiError
        ? { statusCode: error.statusCode, endpoint: error.endpoint }
        : {}),
      ...(error instanceof ScrapingError
        ? { url: error.url, selector: error.selector }
        : {}),
      ...(error instanceof DatabaseError
        ? { operation: error.operation, tableName: error.tableName }
        : {}),
      ...(error instanceof ValidationError
        ? { field: error.field, value: error.value }
        : {})
    };
    
    this.logger.error(error.message, logData);
  }
  
  private executeErrorStrategy(error: AppError): void {
    // エラーの種類に応じた処理
    if (error instanceof ApiError && error.isRetryable) {
      // リトライ可能なAPIエラーの場合は次回のリトライを促す
      this.logger.info(`This API error is retryable and will be retried automatically`);
    } else if (error instanceof DatabaseError) {
      // データベースエラーの場合はシステム管理者に通知するなど
      this.logger.warn(`Database error may require administrator attention`);
    } else if (error instanceof ValidationError) {
      // バリデーションエラーの場合はユーザー入力の修正を促すなど
      this.logger.info(`Validation error should be fixed by correcting input`);
    }
  }
}
```

### 3. リトライメカニズムの導入

一時的なエラーに対して自動的にリトライするメカニズムを実装します。

```typescript
// infrastructure/utils/retry.ts
interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryableErrors?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    retryableErrors = isRetryableError,
    onRetry = defaultOnRetry
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt >= maxRetries || !retryableErrors(error)) {
        throw error;
      }
      
      const delay = calculateBackoffDelay(initialDelayMs, backoffFactor, attempt, maxDelayMs);
      onRetry(error, attempt + 1, delay);
      
      await sleep(delay);
      attempt++;
    }
  }

  // ここには到達しないはずだが型安全のために例外をスロー
  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  // ApiErrorの場合はisRetryableプロパティを参照
  if (error instanceof ApiError) {
    return error.isRetryable;
  }
  
  // ネットワークエラーとみなせるものはリトライ可能
  if (isAxiosError(error) && !error.response) {
    return true;
  }
  
  // デフォルトではリトライしない
  return false;
}

function calculateBackoffDelay(
  initialDelay: number,
  factor: number,
  attempt: number,
  maxDelay: number
): number {
  // 指数バックオフ + ジッター (±10%)
  const exponentialDelay = initialDelay * Math.pow(factor, attempt);
  const jitter = exponentialDelay * (0.9 + Math.random() * 0.2);
  return Math.min(jitter, maxDelay);
}

function defaultOnRetry(error: unknown, attempt: number, delay: number): void {
  console.log(
    `Retrying after error (attempt ${attempt}): ${error instanceof Error ? error.message : String(error)}. ` +
    `Waiting ${Math.round(delay)}ms before next attempt.`
  );
}

// 使用例
async function fetchWithRetry(url: string): Promise<Response> {
  return withRetry(
    () => fetch(url),
    {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      onRetry: (error, attempt, delay) => {
        logger.warn(`Retrying API call to ${url} after error`, {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          nextRetryMs: delay
        });
      }
    }
  );
}
```

### 4. 業務ロジックでのエラー処理の改善

アプリケーションのビジネスロジック内でのエラー処理を改善し、より構造化されたアプローチを導入します。

```typescript
// application/usecases/fetchBiblioInfoUseCase.ts
export class FetchBiblioInfoUseCase {
  constructor(
    private readonly openBdClient: OpenBdApiClient,
    private readonly ndlClient: NdlApiClient,
    private readonly isbnDbClient: IsbnDbApiClient,
    private readonly errorHandler: ErrorHandler,
    private readonly logger: Logger
  ) {}

  async execute(book: Book): Promise<Book> {
    this.logger.info(`Fetching biblio info for book`, { isbn: book.isbn, title: book.title });
    
    // 優先順位に基づいて複数のAPIを試す
    try {
      // 日本の書籍の場合はOpenBDを優先
      if (this.isJapaneseBook(book.isbn)) {
        try {
          return await this.fetchFromOpenBd(book);
        } catch (error) {
          // OpenBDで失敗した場合はNDLを試す
          this.logger.warn(`OpenBD fetch failed, falling back to NDL`, {
            isbn: book.isbn,
            error: error instanceof Error ? error.message : String(error)
          });
          
          try {
            return await this.fetchFromNdl(book);
          } catch (ndlError) {
            // NDLも失敗した場合はISBNDBを試す
            this.logger.warn(`NDL fetch also failed, falling back to ISBNDB`, {
              isbn: book.isbn,
              error: ndlError instanceof Error ? ndlError.message : String(ndlError)
            });
            
            return await this.fetchFromIsbnDb(book);
          }
        }
      } else {
        // 海外の書籍の場合はISBNDBを優先
        try {
          return await this.fetchFromIsbnDb(book);
        } catch (error) {
          // ISBNDBで失敗した場合はOpenBDを試す
          this.logger.warn(`ISBNDB fetch failed, falling back to OpenBD`, {
            isbn: book.isbn,
            error: error instanceof Error ? error.message : String(error)
          });
          
          return await this.fetchFromOpenBd(book);
        }
      }
    } catch (error) {
      // すべてのAPIが失敗した場合
      this.logger.error(`All API attempts failed for book`, {
        isbn: book.isbn,
        title: book.title,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 元の書籍情報をそのまま返す（エラーはログに記録するが処理は継続）
      return book;
    }
  }
  
  private isJapaneseBook(isbn: string): boolean {
    return isbn.startsWith('978-4') || isbn.startsWith('4');
  }
  
  private async fetchFromOpenBd(book: Book): Promise<Book> {
    return withRetry(
      async () => {
        const response = await this.openBdClient.fetchBookInfo(book.isbn);
        if (!response || !response[0]) {
          throw new ApiError(
            `Book not found in OpenBD`,
            404,
            `https://api.openbd.jp/v1/get?isbn=${book.isbn}`
          );
        }
        
        // レスポンスからBookオブジェクトを更新
        return this.mapOpenBdResponseToBook(response, book);
      },
      { maxRetries: 3 }
    );
  }
  
  // 他のフェッチメソッドも同様に実装...
  
  private mapOpenBdResponseToBook(response: OpenBdResponse, originalBook: Book): Book {
    const summary = response[0]?.summary;
    if (!summary) {
      return originalBook;
    }
    
    try {
      return {
        ...originalBook,
        title: summary.title || originalBook.title,
        author: summary.author || originalBook.author,
        publisher: summary.publisher || originalBook.publisher,
        publishedDate: summary.pubdate || originalBook.publishedDate
      };
    } catch (error) {
      // マッピング中のエラーを変換
      throw new ValidationError(
        `Failed to map OpenBD response to book`,
        'response',
        summary,
        error
      );
    }
  }
}
```

### 5. 境界での一貫したエラー処理

アプリケーションの境界（API、CLI、UI）でのエラー処理を統一します。

```typescript
// presentation/cli/commands/baseCommand.ts
export abstract class BaseCommand {
  constructor(
    protected readonly errorHandler: ErrorHandler,
    protected readonly logger: Logger
  ) {}
  
  abstract execute(args: string[]): Promise<void>;
  
  // コマンド実行のラッパー
  async run(args: string[]): Promise<number> {
    try {
      await this.execute(args);
      return 0; // 成功時は0を返す
    } catch (error) {
      try {
        // アプリケーション固有のエラー処理
        if (error instanceof ValidationError) {
          // バリデーションエラーは詳細情報を表示
          console.error(`Validation error: ${error.message}`);
          console.error(`Invalid value for ${error.field}: ${error.value}`);
          return 1;
        } else if (error instanceof ApiError) {
          // APIエラーは簡潔なメッセージを表示
          console.error(`API error (${error.statusCode}): ${error.message}`);
          if (error.isRetryable) {
            console.error(`This error may be temporary. Please try again later.`);
          }
          return 2;
        } else if (error instanceof ScrapingError) {
          // スクレイピングエラー
          console.error(`Error scraping data: ${error.message}`);
          return 3;
        } else if (error instanceof DatabaseError) {
          // データベースエラー
          console.error(`Database error: ${error.message}`);
          return 4;
        } else {
          // その他のエラー
          console.error(`An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`);
          
          // 開発環境ではスタックトレースを表示
          if (process.env.NODE_ENV === 'development' && error instanceof Error && error.stack) {
            console.error(error.stack);
          }
          
          return 99;
        }
      } catch (handlerError) {
        // エラーハンドラ自体がエラーを発生させた場合
        console.error(`Critical error in error handler:`, handlerError);
        return 100;
      }
    }
  }
}

// presentation/cli/commands/wishCommand.ts
export class WishCommand extends BaseCommand {
  constructor(
    private readonly getWishBookListUseCase: GetWishBookListUseCase,
    errorHandler: ErrorHandler,
    logger: Logger
  ) {
    super(errorHandler, logger);
  }
  
  async execute(args: string[]): Promise<void> {
    const userId = args[0] || BOOKMETER_DEFAULT_USER_ID;
    
    this.logger.info(`Fetching wish book list for user ${userId}`);
    
    try {
      const bookList = await this.getWishBookListUseCase.execute({ userId });
      this.logger.info(`Successfully fetched ${bookList.size} books`);
      
      // 出力処理...
    } catch (error) {
      // 特殊なケースのみここで処理し、それ以外は基底クラスに委譲
      if (error instanceof ApiError && error.statusCode === 401) {
        this.logger.error(`Authentication failed. Please check your credentials.`);
        throw new ValidationError(`Invalid credentials`, 'credentials', null, error);
      } else {
        throw error; // 基底クラスのエラーハンドリングにパス
      }
    }
  }
}
```

## 実装戦略

統一的なエラーハンドリングの導入は、以下のステップで段階的に実施します：

### フェーズ1: エラークラスの設計と実装（週1）

1. **エラークラス階層の設計**
   - 基底の`AppError`クラスの実装
   - 機能領域別のエラーサブクラスの定義
   - エラーコードの標準化

2. **既存エラー文字列の移行計画**
   - 現在使用中のエラーコード文字列の列挙
   - 新しいエラークラスへのマッピング設計
   - 置き換え優先順位の決定

### フェーズ2: エラーハンドリングユーティリティの実装（週2）

1. **エラーハンドラーの実装**
   - `ErrorHandler`クラスの実装
   - 集中型ロギングの導入
   - エラー変換ロジックの実装

2. **リトライメカニズムの実装**
   - `withRetry`関数の実装
   - バックオフ戦略の実装
   - リトライ条件の定義

3. **結果型の導入**
   - `Result<T, E>`型または`Either<E, T>`型の導入
   - 成功/失敗のケースを明示的に扱うユーティリティ関数の実装

### フェーズ3: アプリケーションコードへの統合（週3-5）

1. **APIクライアント層の更新**
   - `OpenBdApiClient`などのクライアントクラスのエラーハンドリング改善
   - 適切なエラーオブジェクトの生成
   - リトライメカニズムの適用

2. **スクレイピング層の更新**
   - `BookmeterScraper`などのスクレイピングクラスのエラーハンドリング改善
   - セレクタエラーや操作エラーの適切な処理
   - リトライロジックの適用

3. **データアクセス層の更新**
   - SQLiteリポジトリのエラーハンドリング改善
   - トランザクション管理の強化
   - 適切なエラーオブジェクトの生成

### フェーズ4: ユースケース層と境界の更新（週6-7）

1. **ユースケースのエラーハンドリング改善**
   - フォールバック戦略の実装
   - エラーが発生しても処理を継続する仕組みの導入
   - エラー詳細の適切な記録

2. **CLI境界のエラーハンドリング統一**
   - コマンド基底クラスの実装
   - 終了コードの標準化
   - ユーザーフレンドリーなエラーメッセージの生成

## テスト戦略

エラーハンドリングの改善を効果的にテストするためのアプローチ：

1. **ユニットテスト**
   - 各エラークラスの機能テスト
   - `ErrorHandler`の変換ロジックのテスト
   - リトライメカニズムの動作検証

2. **モックを使用した統合テスト**
   - API障害シナリオのシミュレーション
   - DB接続エラーのシミュレーション
   - ネットワークタイムアウトのシミュレーション

3. **エラー境界条件のテスト**
   - リトライの上限到達時の挙動
   - 様々な種類のエラーが同時に発生する場合の処理

4. **エラーレポーティングのテスト**
   - エラーログの形式と内容の検証
   - 重要なコンテキスト情報が含まれているかの確認

## 期待される成果

統一的なエラーハンドリングの導入により、以下の成果が期待されます：

1. **システムの堅牢性向上**
   - 一時的な障害に対する耐性が向上
   - 予期せぬエラー状況からの回復能力が強化

2. **デバッグ容易性の向上**
   - エラーの原因特定が容易になる
   - コンテキスト情報が充実し、問題解決が迅速化

3. **ユーザー体験の向上**
   - より明確で有用なエラーメッセージの提供
   - 自動リトライによる成功率の向上

4. **コードの一貫性と保守性の向上**
   - エラー処理パターンの標準化
   - エラー処理ロジックの重複削減

5. **システム監視の改善**
   - 構造化されたエラーログによる監視の容易化
   - エラーの傾向分析が可能に
