# 非同期処理の最適化

## 現状の問題点

現在のbookmeterプロジェクトでは、非同期処理に関して以下のような問題が存在します：

### 1. 非効率な非同期処理パターン

- `sleep()`や`randomWait()`を多用した待機処理
- 直列的に実行される非同期処理が多く、全体の処理時間が長い
- 並列処理の制御が不十分で、リソースの使用効率が悪い

```typescript
// 非効率な直列処理の例
for (const node of booksUrlHandle) {
  const bkmt_raw = await getNodeProperty(node, "href");
  const bkmt = String(bkmt_raw);

  const book = await this.scanEachBook(bkmt); // 1冊ずつ逐次処理
  this.#wishBookList.set(bkmt, book);

  cnt++;
  await sleep(sec * 1000); // 固定時間の待機
}

// 固定のsleep時間による待機
console.log("sleeping for 40s...");
await sleep(40 * 1000);
```

### 2. 制御しにくい並列処理

- 独自の`PromiseQueue`実装が複雑で理解しづらい
- エラー処理と並列処理の組み合わせが複雑化している
- 並列度の制御が硬直的

```typescript
// fetchers.ts - 独自のPromiseQueueの使用例
const ps = PromiseQueue();
for (const bookInfo of bookInfoList) {
  ps.add(fetchSingleRequestAPIs(bookInfo, credential, mathLibIsbnList));
  const value = (await ps.wait(5)) as false | { bookmeterUrl: string; updatedBook: Book };
  if (value !== false) booklist.set(value.bookmeterUrl, value.updatedBook);
}
((await ps.all()) as { bookmeterUrl: string; updatedBook: Book }[]).forEach((v) => {
  booklist.set(v.bookmeterUrl, v.updatedBook);
});
```

### 3. キャンセレーションの欠如

- 長時間実行される処理を中断する機能がない
- 一部の処理が失敗した場合に、関連する他の処理をキャンセルする機能がない
- 実行中のスクレイピングなどを安全に停止する方法がない

### 4. 非同期フローの可読性問題

- 複雑なPromiseチェーンが理解しづらい
- コールバックのネストが深い箇所がある
- エラーフローと正常系フローが混在しており追跡しにくい

```typescript
// 複雑な非同期フローの例
await $x(page, XPATH.book.registerWishBook).then((wishButtonHandle) => wishButtonHandle[0].click());

// ネストが深いコールバック
book.login().then((book) => book.explore(mode, doLogin));
```

## 提案する改善策

### 1. 効率的な並行処理パターンの導入

並列処理を効率的に行うパターンを導入し、処理時間を短縮します。

#### a. バッチ処理による並列化

```typescript
// infrastructure/utils/batch.ts
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: { batchSize?: number; concurrency?: number; delay?: number } = {}
): Promise<R[]> {
  const { batchSize = 10, concurrency = 3, delay = 0 } = options;
  const results: R[] = [];
  
  // バッチに分割
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  // 一定の並列数でバッチを処理
  for (let i = 0; i < batches.length; i += concurrency) {
    const currentBatches = batches.slice(i, i + concurrency);
    
    // 各バッチを並列処理
    const batchResults = await Promise.all(
      currentBatches.map(async batch => {
        // バッチ内のアイテムを処理
        const batchItemResults: R[] = [];
        for (const item of batch) {
          const result = await processor(item);
          batchItemResults.push(result);
        }
        return batchItemResults;
      })
    );
    
    // 結果を集約
    for (const batchResult of batchResults) {
      results.push(...batchResult);
    }
    
    // 次のバッチ処理の前に待機（レート制限対策）
    if (delay > 0 && i + concurrency < batches.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}

// 使用例
// スクレイピングでの書籍データ取得
async function getWishBooks(browser: Browser, userId: string): Promise<BookList> {
  const page = await browser.newPage();
  
  try {
    // ページからURLリストを取得
    const bookUrls = await getAllBookUrls(page, userId);
    
    // URLリストに対して並列処理
    const books = await processBatch(
      bookUrls,
      url => scrapeBookDetails(browser, url),
      { batchSize: 5, concurrency: 3, delay: 1000 }
    );
    
    // 結果をMapに変換
    const bookList: BookList = new Map();
    for (let i = 0; i < bookUrls.length; i++) {
      bookList.set(bookUrls[i], books[i]);
    }
    
    return bookList;
  } finally {
    await page.close();
  }
}
```

#### b. 並列処理の細かい制御

```typescript
// infrastructure/utils/limiter.ts
export class Limiter {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  
  constructor(private readonly concurrency: number) {}
  
  async add<T>(fn: () => Promise<T>): Promise<T> {
    // 並列数が上限に達していたらキューに追加して待機
    if (this.running >= this.concurrency) {
      return new Promise<T>((resolve, reject) => {
        this.queue.push(async () => {
          try {
            resolve(await fn());
          } catch (error) {
            reject(error);
          }
        });
      });
    }
    
    // 実行
    this.running++;
    try {
      const result = await fn();
      return result;
    } finally {
      this.running--;
      this.runNext();
    }
  }
  
  private runNext(): void {
    if (this.queue.length > 0 && this.running < this.concurrency) {
      const next = this.queue.shift()!;
      this.running++;
      
      // 次の処理を実行
      next().finally(() => {
        this.running--;
        this.runNext();
      });
    }
  }
}

// 使用例
const limiter = new Limiter(5); // 最大5つの並列処理

// 複数のAPIリクエストを並列実行（最大5つまで）
const promises = urls.map(url => 
  limiter.add(() => fetch(url).then(res => res.json()))
);
const results = await Promise.all(promises);
```

#### c. スロットリングとレート制限

```typescript
// infrastructure/utils/throttle.ts
export class RateLimiter {
  private lastExecutionTime = 0;
  private queue: Array<() => void> = [];
  private timer: NodeJS.Timeout | null = null;
  
  constructor(private readonly requestsPerInterval: number, private readonly intervalMs: number) {}
  
  async limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // キューに追加
      this.queue.push(() => {
        fn().then(resolve).catch(reject);
      });
      
      // キュー処理を開始
      this.processQueue();
    });
  }
  
  private processQueue(): void {
    if (this.timer !== null) return;
    
    const process = (): void => {
      // キューが空の場合は終了
      if (this.queue.length === 0) {
        this.timer = null;
        return;
      }
      
      const now = Date.now();
      const elapsed = now - this.lastExecutionTime;
      
      if (elapsed >= this.intervalMs) {
        // 間隔が空いていたらすぐに実行
        this.lastExecutionTime = now;
        
        // リクエスト数だけ実行
        const count = Math.min(this.requestsPerInterval, this.queue.length);
        for (let i = 0; i < count; i++) {
          const task = this.queue.shift();
          if (task) task();
        }
        
        // 次の実行をスケジュール
        this.timer = setTimeout(process, this.intervalMs);
      } else {
        // 前回の実行からの経過時間が足りない場合は待機
        const waitTime = this.intervalMs - elapsed;
        this.timer = setTimeout(process, waitTime);
      }
    };
    
    process();
  }
}

// 使用例
const rateLimiter = new RateLimiter(5, 1000); // 1秒あたり最大5リクエスト

// API呼び出しをレート制限付きで実行
const results = await Promise.all(
  urls.map(url => rateLimiter.limit(() => fetch(url).then(res => res.json())))
);
```

### 2. AbortController/Signalによるキャンセレーション

非同期処理をキャンセル可能にすることで、リソースの無駄な使用を防ぎます。

```typescript
// application/usecases/getWishBooksUseCase.ts
export class GetWishBooksUseCase {
  constructor(
    private readonly bookmeterScraper: BookmeterScraper,
    private readonly logger: Logger
  ) {}
  
  async execute(params: { userId: string; signal?: AbortSignal }): Promise<BookList> {
    const { userId, signal } = params;
    
    // キャンセルチェック用のヘルパー関数
    const checkCancellation = (): void => {
      if (signal?.aborted) {
        throw new Error('Operation was cancelled');
      }
    };
    
    this.logger.info(`Fetching wish books for user ${userId}`);
    
    try {
      // 初期キャンセルチェック
      checkCancellation();
      
      const browser = await puppeteer.launch({
        defaultViewport: { width: 1000, height: 1000 },
        headless: true,
        args: CHROME_ARGS
      });
      
      try {
        // ブラウザ起動後のキャンセルチェック
        checkCancellation();
        
        // スクレイピング処理（信号を渡す）
        const bookList = await this.bookmeterScraper.getWishBooks(browser, userId, signal);
        
        // 完了前の最終キャンセルチェック
        checkCancellation();
        
        return bookList;
      } finally {
        await browser.close();
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation was cancelled') {
        this.logger.info(`Operation was cancelled by user for user ${userId}`);
        throw error;
      }
      
      this.logger.error(`Error fetching wish books for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
}

// infrastructure/adapters/scraping/bookmeterScraper.ts
export class BookmeterScraper {
  async getWishBooks(browser: Browser, userId: string, signal?: AbortSignal): Promise<BookList> {
    const page = await browser.newPage();
    
    try {
      // キャンセルチェック
      if (signal?.aborted) {
        throw new Error('Operation was cancelled');
      }
      
      const bookList: BookList = new Map();
      let pageNum = 1;
      
      // 各ページを処理
      while (true) {
        // キャンセルチェック
        if (signal?.aborted) {
          throw new Error('Operation was cancelled');
        }
        
        await page.goto(`${BOOKMETER_BASE_URI}/users/${userId}/books/wish?page=${pageNum}`);
        
        const booksUrlHandle = await page.$x(XPATH.wish.login.booksUrl);
        if (booksUrlHandle.length === 0) {
          break;
        }
        
        // URLを収集
        const urls: string[] = [];
        for (const handle of booksUrlHandle) {
          const href = await handle.evaluate(node => node.getAttribute('href'));
          if (href) urls.push(href);
        }
        
        // バッチ処理で並列スクレイピング
        const books = await this.scrapeBooks(browser, urls, signal);
        
        // 結果を追加
        for (let i = 0; i < urls.length; i++) {
          bookList.set(urls[i], books[i]);
        }
        
        pageNum++;
      }
      
      return bookList;
    } finally {
      await page.close();
    }
  }
  
  private async scrapeBooks(browser: Browser, urls: string[], signal?: AbortSignal): Promise<Book[]> {
    // バッチ処理で効率的に並列スクレイピング
    return processBatch(
      urls,
      async url => {
        // キャンセルチェック
        if (signal?.aborted) {
          throw new Error('Operation was cancelled');
        }
        
        return this.scrapeBook(browser, url);
      },
      { batchSize: 5, concurrency: 3, delay: 1000 }
    );
  }
  
  private async scrapeBook(browser: Browser, url: string): Promise<Book> {
    // 1冊の書籍情報をスクレイピング
  }
}

// presentation/cli/commands/wishCommand.ts
export class WishCommand extends BaseCommand {
  async execute(args: string[]): Promise<void> {
    const userId = args[0] || BOOKMETER_DEFAULT_USER_ID;
    
    // キャンセルコントローラの初期化
    const controller = new AbortController();
    const { signal } = controller;
    
    // タイムアウト設定（30分）
    const timeout = setTimeout(() => {
      this.logger.warn(`Operation timed out after 30 minutes`);
      controller.abort();
    }, 30 * 60 * 1000);
    
    // Ctrl+Cハンドラ
    const handleSigInt = (): void => {
      this.logger.info(`Received SIGINT signal, aborting operation`);
      controller.abort();
    };
    
    process.on('SIGINT', handleSigInt);
    
    try {
      // キャンセル可能な形で実行
      const bookList = await this.getWishBookListUseCase.execute({ userId, signal });
      this.logger.info(`Successfully fetched ${bookList.size} books`);
      
      // 結果の出力処理...
    } finally {
      // クリーンアップ
      clearTimeout(timeout);
      process.off('SIGINT', handleSigInt);
    }
  }
}
```

### 3. 非同期フローの簡素化

非同期フローを読みやすく、メンテナンスしやすくする改善を行います。

#### a. async/awaitの一貫した使用

```typescript
// Before
book.login().then((book) => book.explore(mode, doLogin));

// After
const loggedInBook = await book.login();
const bookList = await loggedInBook.explore(mode, doLogin);
```

#### b. 非同期処理の整理と構造化

```typescript
// application/usecases/fetchAndSaveBookListUseCase.ts
export class FetchAndSaveBookListUseCase {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly bookScraper: BookScraperService,
    private readonly biblioInfoService: BiblioInfoService,
    private readonly logger: Logger
  ) {}

  async execute(params: {
    mode: "wish" | "stacked";
    userId: string;
    skipBiblioInfo?: boolean;
    signal?: AbortSignal;
  }): Promise<void> {
    const { mode, userId, skipBiblioInfo = false, signal } = params;

    // 段階的に処理を実行し、各ステップでキャンセルを確認
    try {
      this.logger.info(`Starting fetch and save process for ${mode} books of user ${userId}`);

      // 1. スクレイピングで書籍リストを取得
      this.logger.info(`Fetching book list from Bookmeter`);
      const bookList = await this.bookScraper.getBookList(mode, userId, signal);
      
      // キャンセル確認
      if (signal?.aborted) throw new Error('Operation was cancelled');
      
      // 2. 前回データと比較して変更があるか確認
      this.logger.info(`Comparing with previous data`);
      const prevBookList = await this.bookRepository.findAll(mode);
      const hasDifferences = this.compareBookLists(prevBookList, bookList);
      
      if (!hasDifferences) {
        this.logger.info(`No changes detected, skipping further processing`);
        return;
      }
      
      // キャンセル確認
      if (signal?.aborted) throw new Error('Operation was cancelled');
      
      // 3. 書誌情報の取得（必要な場合）
      let enhancedBookList = bookList;
      if (!skipBiblioInfo) {
        this.logger.info(`Fetching bibliographic information`);
        enhancedBookList = await this.biblioInfoService.enhanceBooks(bookList, signal);
      }
      
      // キャンセル確認
      if (signal?.aborted) throw new Error('Operation was cancelled');
      
      // 4. データの保存
      this.logger.info(`Saving data to repository`);
      await this.bookRepository.save(enhancedBookList, mode);
      
      this.logger.info(`Fetch and save process completed successfully`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation was cancelled') {
        this.logger.info(`Operation was cancelled`);
        throw error;
      }
      
      this.logger.error(`Error in fetch and save process`, {
        error: error instanceof Error ? error.message : String(error),
        mode,
        userId
      });
      
      throw error;
    }
  }
  
  private compareBookLists(prevList: BookList, newList: BookList): boolean {
    // 比較ロジック...
    return true; // 変更あり
  }
}
```

#### c. Promise.allSettledの活用

```typescript
// application/services/biblioInfoService.ts
export class BiblioInfoService {
  constructor(
    private readonly apiClients: BiblioInfoProvider[],
    private readonly logger: Logger
  ) {}
  
  async enhanceBooks(books: BookList, signal?: AbortSignal): Promise<BookList> {
    const enhancedBooks: BookList = new Map();
    
    // すべての書籍に対して処理
    for (const [url, book] of books.entries()) {
      // キャンセルチェック
      if (signal?.aborted) {
        throw new Error('Operation was cancelled');
      }
      
      try {
        // API呼び出しを並列実行し、すべての結果を収集（失敗も含む）
        const results = await Promise.allSettled(
          this.apiClients.map(client => client.fetchInfo(book))
        );
        
        // 成功した結果を集約
        let enhancedBook = book;
        
        for (const result of results) {
          if (result.status === 'fulfilled') {
            // 成功したAPIレスポンスでブックを更新
            enhancedBook = this.mergeBookData(enhancedBook, result.value);
          } else {
            // エラーはログに記録するが処理は継続
            this.logger.warn(`API client failed for book ${book.title}`, {
              isbn: book.isbn,
              error: result.reason
            });
          }
        }
        
        enhancedBooks.set(url, enhancedBook);
      } catch (error) {
        // 全体的なエラーの場合は元の書籍データを使用し処理を継続
        this.logger.error(`Failed to enhance book ${book.title}`, {
          isbn: book.isbn,
          error: error instanceof Error ? error.message : String(error)
        });
        
        enhancedBooks.set(url, book);
      }
    }
    
    return enhancedBooks;
  }
  
  private mergeBookData(original: Book, update: Partial<Book>): Book {
    // 優先順位を考慮して書籍データをマージ
    return {
      ...original,
      ...update,
      // タイトルや著者が空文字列の場合は元の値を保持
      title: update.title && update.title !== "" ? update.title : original.title,
      author: update.author && update.author !== "" ? update.author : original.author,
      // その他のフィールド...
    };
  }
}
```

### 4. ストリーミング処理の導入

大量のデータを効率的に処理するためのストリーミングパターンを導入します。

```typescript
// infrastructure/utils/stream.ts
export async function* batchIterator<T>(
  items: T[],
  batchSize: number
): AsyncGenerator<T[], void, undefined> {
  for (let i = 0; i < items.length; i += batchSize) {
    yield items.slice(i, i + batchSize);
  }
}

// infrastructure/adapters/repositories/sqliteBookRepository.ts
export class SqliteBookRepository implements BookRepository {
  async saveAll(books: BookList, mode: "wish" | "stacked"): Promise<void> {
    const db = await this.getConnection();
    
    try {
      await db.run('BEGIN TRANSACTION');
      
      // 書籍データをバッチに分割
      const batchSize = 100;
      const bookEntries = Array.from(books.entries());
      
      // ストリーミング処理
      for await (const batch of batchIterator(bookEntries, batchSize)) {
        // バッチ内の各書籍を挿入
        for (const [url, book] of batch) {
          await db.run(
            `INSERT OR REPLACE INTO ${this.getTableName(mode)} 
             (url, isbn, title, author, publisher, published_date, ...)
             VALUES (?, ?, ?, ?, ?, ?, ...)`,
            [url, book.isbn, book.title, book.author, book.publisher, book.publishedDate, ...]
          );
        }
      }
      
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }
}
```

## 実装戦略

非同期処理の最適化は、以下のステップで段階的に実施します：

### フェーズ1: 非同期ユーティリティの設計と実装（週1-2）

1. **並列処理ユーティリティの実装**
   - `processBatch`関数の実装
   - `Limiter`クラスの実装
   - `RateLimiter`クラスの実装

2. **キャンセレーション機能の設計**
   - `AbortController/Signal`の活用方法の設計
   - キャンセル時の後処理戦略の決定

### フェーズ2: スクレイピング処理の最適化（週3-4）

1. **BookmeterScraper の改善**
   - リスト取得と詳細スクレイピングの分離
   - バッチ処理による並列スクレイピングの導入
   - キャンセレーション対応

2. **Puppeteer 操作の効率化**
   - ブラウザインスタンスの再利用
   - ページプール実装
   - リソース使用効率の最適化

### フェーズ3: API処理の最適化（週5）

1. **APIクライアントの改善**
   - 並列リクエスト制御の実装
   - レート制限への対応強化
   - キャンセレーション対応

2. **バルクオペレーションの最適化**
   - リクエスト集約機能の実装
   - 効率的なバッチ処理の導入

### フェーズ4: データ処理の最適化（週6-7）

1. **ストリーミング処理の導入**
   - ジェネレータを使用したストリーミング実装
   - メモリ効率の最適化

2. **非同期フローの整理**
   - `Promise.allSettled`の適切な使用
   - エラーハンドリングとの統合
   - 全体的な処理フローの簡素化

## テスト戦略

非同期処理の最適化を効果的にテストするためのアプローチ：

1. **ユニットテスト**
   - 各非同期ユーティリティの機能検証
   - エッジケース（空リスト、大量データなど）のテスト
   - キャンセレーション挙動の検証

2. **パフォーマンステスト**
   - 実行時間の計測
   - メモリ使用量のモニタリング
   - 並列度によるパフォーマンス変化の検証

3. **モックを使ったシミュレーション**
   - ネットワーク遅延のシミュレーション
   - レート制限の模擬
   - 失敗ケースの再現

## 期待される成果

非同期処理の最適化により、以下の成果が期待されます：

1. **処理速度の向上**
   - 効率的な並列処理による全体的な処理時間の短縮
   - APIリクエストの最適化によるレスポンス時間の改善

2. **リソース使用の効率化**
   - メモリ使用量の最適化
   - CPU使用率の平準化
   - ネットワーク帯域の効率的な利用

3. **操作性の向上**
   - 長時間実行処理の中断機能
   - 進捗状況の可視化
   - タイムアウトによる自動キャンセル

4. **コードの可読性と保守性の向上**
   - 一貫した非同期パターンの適用
   - 複雑な非同期フローの簡素化
   - テスト容易性の向上
