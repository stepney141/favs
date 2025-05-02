# 関数型プログラミングの原則強化

## 現状の問題点

現在のbookmeterプロジェクトでは、関数型プログラミング(FP)の原則が十分に活用されておらず、以下のような問題が発生しています：

### 1. 可変状態の多用

- `Bookmaker`クラスの内部状態（`#wishBookList`, `#stackedBookList`, `#hasChanges`）が直接変更されている
- 関数の引数として渡されたデータ構造が関数内で直接変更されている（例：`fetchBiblioInfo`内での`booklist.set()`）
- 変数の再代入が多用されている（例：`updatedBooklist = await fetchBiblioInfo(...)`）

```typescript
// bookmaker.ts - 内部状態を直接変更している例
async #getWishBooks(page: Page, isSignedIn: boolean): Promise<Map<string, Book>> {
  for (let i = 0; i < booksUrlHandle.length; i++) {
    // ...
    this.#wishBookList.set(bkmt, {
      // 内部状態を直接変更
      bookmeter_url: bkmt,
      isbn_or_asin: amzn,
      // ...
    });
  }
  return this.#wishBookList;
}

// fetchers.ts - 引数を直接変更している例
export async function fetchBiblioInfo(
  booklist: BookList,
  credential: { cinii: string; google: string; isbnDb: string }
): Promise<BookList> {
  // ...
  for (const bookInfo of bookInfoList) {
    ps.add(fetchSingleRequestAPIs(bookInfo, credential, mathLibIsbnList));
    const value = (await ps.wait(5)) as false | { bookmeterUrl: string; updatedBook: Book };
    if (value !== false) booklist.set(value.bookmeterUrl, value.updatedBook); // 引数を直接変更
  }
  // ...
  return new Map(booklist);
}
```

### 2. 副作用の散在

- データ取得（API呼び出し、DB操作、ファイルI/O）と純粋なデータ処理（変換、検証）が混在している
- `console.log`/`console.error`の使用が広範囲に散らばっている
- 同じ関数内でブラウザ操作と値の返却を行っている

```typescript
// kinokuniya.ts - 副作用の混在例
async function getBookDetails(page: Page, bookUrl: string): Promise<string> {
  try {
    // ブラウザ操作（副作用）
    await page.goto(bookUrl, { waitUntil: "domcontentloaded" });
    
    // 要素取得とデータ抽出（副作用＋データ処理）
    const bookDescriptionHandle = await $x(page, XPATH.kinokuniya.bookDescription);
    const description = await getNodeProperty(bookDescriptionHandle[0], "textContent");
    
    // コンソール出力（副作用）
    console.log(`書籍の説明を取得しました: ${bookUrl}`);
    
    // データの整形と返却（純粋な処理）
    return description.trim();
  } catch (error) {
    // エラー処理と出力（副作用）
    console.error(`説明の取得に失敗しました: ${bookUrl}`, error);
    return "";
  }
}
```

### 3. 型安全性の不足

- 型アサーションの過剰使用：`as ISBN10 | ASIN`など
- nullやundefinedの扱いが一貫していない
- 異なるケース（成功/失敗）を表現するための専用データ型の不足

```typescript
// fetchSingleRequestAPIs - 型アサーションと複雑な条件分岐の例
async function fetchSingleRequestAPIs(
  searchState: BookSearchState,
  credential: { cinii: string; google: string; isbnDb: string },
  mathLibIsbnList: Set<string>
): Promise<{ bookmeterUrl: string; updatedBook: Book }> {
  const isbn = searchState.book["isbn_or_asin"];
  if (isAsin(isbn)) {
    return {
      bookmeterUrl: searchState.book.bookmeter_url,
      updatedBook: { ...searchState.book }
    };
  }
  
  // 中略...
  
  // 型の安全性なしに条件分岐
  if (!updatedSearchState.isFound) {
    updatedSearchState = await fetchISBNdb(updatedSearchState.book, credential.isbnDb);
  }
  
  // 中略...
  
  return {
    bookmeterUrl: updatedSearchState.book.bookmeter_url,
    updatedBook: updatedSearchState.book
  };
}
```

### 4. 手続き型スタイルのコード

- 命令型のループや条件分岐が多用されている
- 関数の合成や変換チェーンが少ない
- 中間変数の多用

```typescript
// 命令型のループと条件分岐の例
for (let i = 0; i < booksUrlHandle.length; i++) {
  const bkmt_raw = await getNodeProperty(booksUrlHandle[i], "href");
  const bkmt = String(bkmt_raw);

  const amzn_raw: string = await getNodeProperty(amazonLinkHandle[i], "href");
  const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN;

  this.#wishBookList.set(bkmt, {
    bookmeter_url: bkmt,
    isbn_or_asin: amzn,
    // ...
  });
}
```

## 提案する改善策

### 1. 不変データ構造の採用

可変状態を避け、データの変更が必要な場合は新しいオブジェクトを作成して返す方式に変更します。

#### a. イミュータブルなドメインモデルの導入

```typescript
// domain/models/book.ts
export interface Book {
  readonly id: BookId;
  readonly title: string;
  readonly author: string;
  readonly isbn: ISBN;
  readonly publisher?: string;
  readonly publishedDate?: string;
  readonly description?: string;
  // その他のプロパティ
}

// イミュータブルな更新ヘルパー関数
export function updateBook(book: Book, updates: Partial<Book>): Book {
  return { ...book, ...updates };
}
```

#### b. コレクション操作のイミュータブル化

```typescript
// 不変なMaptの操作例
function addBook(books: ReadonlyMap<string, Book>, key: string, book: Book): ReadonlyMap<string, Book> {
  return new Map([...books.entries(), [key, book]]);
}

function removeBook(books: ReadonlyMap<string, Book>, key: string): ReadonlyMap<string, Book> {
  const newMap = new Map(books);
  newMap.delete(key);
  return newMap;
}

// 使用例
let books: ReadonlyMap<string, Book> = new Map();
books = addBook(books, book.id, book); // 新しいMapを返す
```

#### c. 状態を持つクラスをステートレスに変換

```typescript
// Before: 状態を持つクラス
export class Bookmaker {
  #browser: Browser;
  #userId: string;
  #wishBookList: BookList = new Map();
  #stackedBookList: BookList = new Map();
  #hasChanges: boolean = false;
  
  // getters, setters, methods...
}

// After: 純粋関数ベースのアプローチ
export interface BookScraperService {
  getWishBooks(browser: Browser, userId: string): Promise<BookList>;
  getStackedBooks(browser: Browser, userId: string): Promise<BookList>;
}

export class BookmeterScraper implements BookScraperService {
  async getWishBooks(browser: Browser, userId: string): Promise<BookList> {
    const page = await browser.newPage();
    try {
      // スクレイピングロジック
      const books: BookList = new Map();
      // データ取得ロジック...
      return books; // 新しいMapを返す
    } finally {
      await page.close();
    }
  }
  
  // その他のメソッド...
}
```

### 2. 副作用の分離と純粋関数の使用

副作用（I/O操作）と純粋なデータ変換処理を明確に分離します。

#### a. データ取得と処理の分離

```typescript
// infrastructure/adapters/apis/openBdApi.ts
export class OpenBdApiClient {
  private httpClient: HttpClient;
  
  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }
  
  // 副作用を含む関数：APIリクエスト
  async fetchBook(isbn: string): Promise<OpenBD.Response | null> {
    try {
      return await this.httpClient.get(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    } catch (error) {
      this.logger.error("OpenBD API error", { isbn, error });
      return null;
    }
  }
}

// domain/services/openBdService.ts
export class OpenBdService {
  // 純粋関数：データ変換のみ
  transformResponse(response: OpenBD.Response | null, book: Book): Book {
    if (!response || response[0] === null) {
      return book;
    }
    
    const bookinfo = response[0].summary;
    const title = bookinfo.title || "";
    const volume = bookinfo.volume || "";
    const series = bookinfo.series || "";
    
    return {
      ...book,
      book_title: `${title}${volume ? ' ' + volume : ''}${series ? ' (' + series + ')' : ''}`,
      author: bookinfo.author || "",
      publisher: bookinfo.publisher || "",
      published_date: bookinfo.pubdate || ""
    };
  }
}

// application/usecases/fetchBiblioInfoUseCase.ts
export class FetchBiblioInfoUseCase {
  constructor(
    private openBdClient: OpenBdApiClient,
    private openBdService: OpenBdService,
    // 他のAPIクライアントとサービス
  ) {}
  
  async execute(book: Book): Promise<Book> {
    // 副作用：API呼び出し
    const response = await this.openBdClient.fetchBook(book.isbn);
    
    // 純粋関数：データ変換
    return this.openBdService.transformResponse(response, book);
  }
}
```

#### b. ロギングの分離

```typescript
// infrastructure/logging/logger.ts
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export class ConsoleLogger implements Logger {
  constructor(private readonly prefix: string) {}
  
  debug(message: string, context?: Record<string, unknown>): void {
    console.log(`[DEBUG] ${this.prefix}: ${message}`, context || '');
  }
  
  // 他のメソッド実装...
}

// 使用例
const logger = new ConsoleLogger("OpenBD API");
logger.error("API request failed", { isbn, statusCode: 404 });
```

#### c. ブラウザ操作の分離

```typescript
// 副作用：ブラウザ操作
async function navigateToBookPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
}

// 副作用：要素の取得
async function getDescriptionElement(page: Page): Promise<ElementHandle | null> {
  try {
    return (await $x(page, XPATH.kinokuniya.bookDescription))[0] || null;
  } catch (error) {
    return null;
  }
}

// 純粋関数：テキスト整形
function formatDescription(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

// 使用例
async function getBookDescription(page: Page, bookUrl: string): Promise<string> {
  await navigateToBookPage(page, bookUrl);
  const element = await getDescriptionElement(page);
  
  if (!element) {
    return "";
  }
  
  const rawText = await getNodeProperty(element, "textContent");
  return formatDescription(rawText);
}
```

### 3. 型安全性の強化

#### a. 代数的データ型の導入

Either型を使って成功/失敗を表現します。

```typescript
// either.ts
export type Either<E, A> = 
  | { readonly _tag: 'Left'; readonly left: E } 
  | { readonly _tag: 'Right'; readonly right: A };

export const left = <E, A>(e: E): Either<E, A> => ({ _tag: 'Left', left: e });
export const right = <E, A>(a: A): Either<E, A> => ({ _tag: 'Right', right: a });

export const isLeft = <E, A>(e: Either<E, A>): e is { _tag: 'Left'; left: E } => 
  e._tag === 'Left';
export const isRight = <E, A>(e: Either<E, A>): e is { _tag: 'Right'; right: A } => 
  e._tag === 'Right';

// 使用例
type ApiError = {
  code: string;
  message: string;
  statusCode?: number;
};

async function fetchBookInfo(isbn: string): Promise<Either<ApiError, Book>> {
  try {
    const response = await httpClient.get(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    
    if (!response || response[0] === null) {
      return left({
        code: 'NOT_FOUND',
        message: `Book with ISBN ${isbn} not found`
      });
    }
    
    // データ変換処理...
    const book = transformOpenBdResponse(response);
    
    return right(book);
  } catch (error) {
    return left({
      code: 'API_ERROR',
      message: error instanceof Error ? error.message : String(error),
      statusCode: isAxiosError(error) ? error.response?.status : undefined
    });
  }
}

// 呼び出し元
const result = await fetchBookInfo(isbn);

if (isRight(result)) {
  const book = result.right;
  // 成功時の処理
} else {
  const error = result.left;
  // エラー時の処理
}
```

#### b. ランタイム型検証の導入

`io-ts`または`zod`を使用してランタイム型検証を行います。

```typescript
// schemas.ts (zod使用の例)
import { z } from 'zod';

export const IsbnSchema = z.string().refine(
  (val) => /^([0-9]{9}[0-9X]|[0-9]{13})$/.test(val),
  { message: "Invalid ISBN format" }
);

export const BookSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  author: z.string(),
  isbn: IsbnSchema,
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional()
});

export type Book = z.infer<typeof BookSchema>;

// API応答のバリデーション
export const OpenBdResponseSchema = z.array(
  z.object({
    summary: z.object({
      isbn: z.string(),
      title: z.string(),
      volume: z.string().optional(),
      series: z.string().optional(),
      publisher: z.string().optional(),
      pubdate: z.string().optional(),
      author: z.string().optional()
    }).nullable()
  }).nullable()
);

// 使用例
function validateApiResponse(data: unknown): Either<Error, OpenBD.Response> {
  try {
    const validated = OpenBdResponseSchema.parse(data);
    return right(validated);
  } catch (error) {
    return left(new Error(`Invalid API response: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

#### c. 型ガードの活用

```typescript
// 型アサーションの代わりに型ガードを使用
function isISBN10(isbn: string): isbn is ISBN10 {
  return /^[0-9]{9}[0-9X]$/.test(isbn);
}

function isASIN(code: string): code is ASIN {
  return /^[A-Z0-9]{10}$/.test(code) && !isISBN10(code);
}

// Nullチェックを伴う型ガード
function isNonEmptyArray<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

// 使用例
if (isISBN10(identifier)) {
  // この中では identifierはISBN10型として扱われる
} else if (isASIN(identifier)) {
  // この中では identifierはASIN型として扱われる
} else {
  // 不明な識別子の処理
}
```

### 4. 関数型プログラミングパターンの導入

#### a. パイプライン処理の導入

`fp-ts`の`pipe`を使ってデータ変換パイプラインを構築します。

```typescript
import { pipe } from 'fp-ts/function';

// 純粋関数の合成
function processBook(book: Book, openBdResponse: OpenBD.Response | null): Book {
  return pipe(
    book,
    (b) => addBasicInfo(b, openBdResponse),
    addLibraryAvailability,
    addMathLibStatus
  );
}

// 個別の変換関数
function addBasicInfo(book: Book, response: OpenBD.Response | null): Book {
  if (!response || !response[0] || !response[0].summary) {
    return book;
  }
  
  const summary = response[0].summary;
  
  return {
    ...book,
    title: summary.title || book.title,
    author: summary.author || book.author,
    publisher: summary.publisher || book.publisher,
    publishedDate: summary.pubdate || book.publishedDate
  };
}

function addLibraryAvailability(book: Book): Book {
  // 所蔵状況の処理...
  return {
    ...book,
    exist_in_Sophia: isAvailableInSophia(book.isbn) ? "Yes" : "No",
    exist_in_UTokyo: isAvailableInUTokyo(book.isbn) ? "Yes" : "No"
  };
}

function addMathLibStatus(book: Book): Book {
  // 数学図書館の処理...
  return {
    ...book,
    sophia_mathlib_opac: generateMathLibLink(book.isbn)
  };
}
```

#### b. Option/Maybe型の活用

`fp-ts`の`Option`型を使って、null/undefinedの取り扱いを安全にします。

```typescript
import { pipe } from 'fp-ts/function';
import { Option, some, none, map, getOrElse } from 'fp-ts/Option';

// Option型を返す関数
function findBookByIsbn(isbn: string, books: ReadonlyMap<string, Book>): Option<Book> {
  for (const [_, book] of books.entries()) {
    if (book.isbn === isbn) {
      return some(book);
    }
  }
  return none;
}

// Optionの連鎖
function getPublisherOrDefault(isbn: string, books: ReadonlyMap<string, Book>): string {
  return pipe(
    findBookByIsbn(isbn, books),
    map(book => book.publisher),
    getOrElse(() => "出版社不明")
  );
}
```

#### c. 非同期処理のためのTaskEither

`fp-ts`の`TaskEither`を使って非同期処理を型安全に扱います。

```typescript
import { pipe } from 'fp-ts/function';
import { TaskEither, tryCatch, map, chain } from 'fp-ts/TaskEither';

type ApiError = {
  code: string;
  message: string;
};

// TaskEitherを使った非同期処理
function fetchBookInfo(isbn: string): TaskEither<ApiError, OpenBD.Response> {
  return tryCatch(
    async () => {
      const response = await axios.get(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      return response.data;
    },
    (error): ApiError => ({
      code: 'API_ERROR',
      message: error instanceof Error ? error.message : String(error)
    })
  );
}

function validateResponse(response: OpenBD.Response): TaskEither<ApiError, OpenBD.Response> {
  if (!response || !response[0]) {
    return tryCatch(
      async () => { throw new Error('Book not found'); },
      (): ApiError => ({
        code: 'NOT_FOUND',
        message: 'Book not found in OpenBD'
      })
    );
  }
  return tryCatch(
    async () => response,
    () => ({ code: 'UNKNOWN', message: 'Unknown error' })
  );
}

function transformToBook(response: OpenBD.Response, original: Book): TaskEither<ApiError, Book> {
  return tryCatch(
    async () => {
      const summary = response[0]?.summary;
      if (!summary) {
        return original;
      }
      
      return {
        ...original,
        title: summary.title || original.title,
        author: summary.author || original.author,
        // 他のプロパティマッピング
      };
    },
    (): ApiError => ({
      code: 'TRANSFORM_ERROR',
      message: 'Error transforming response to book'
    })
  );
}

// 使用例
async function enhanceBookInfo(isbn: string, original: Book): Promise<Either<ApiError, Book>> {
  const program = pipe(
    fetchBookInfo(isbn),
    chain(validateResponse),
    chain(response => transformToBook(response, original))
  );
  
  return program();
}
```

## 実装戦略

関数型プログラミングの原則の適用は、以下の段階で実施します：

### フェーズ1: 基本的なFP原則の導入（週1-2）

1. **不変なドメインモデルの実装**
   - `Book`インターフェースのreadonly修飾子追加
   - 更新ヘルパー関数の作成
   - テストの作成

2. **共通ユーティリティの作成**
   - `Either`、`Option`の実装（またはfp-tsの導入）
   - 型ガード関数の整備
   - 安全なコレクション操作関数の実装

3. **型検証ライブラリの導入**
   - zodまたはio-tsのセットアップ
   - 主要なスキーマ定義の作成
   - バリデーション関数の実装

### フェーズ2: 既存コードの段階的変換（週3-5）

1. **状態管理の改善**
   - `Bookmaker`クラスの段階的リファクタリング
   - 内部状態の排除
   - 命令型コードから宣言型への変換

2. **副作用の分離**
   - API呼び出しとデータ変換処理の分離
   - ブラウザ操作と純粋なデータ処理の分離
   - ロギング層の分離と統一インターフェースの導入

3. **非同期処理の改善**
   - `Promise`ベースのコードをより宣言的なスタイルに変換
   - エラーハンドリングの統合
   - `TaskEither`の導入（可能であれば）

### フェーズ3: 高度なFPパターンの適用（週6-7）

1. **パイプライン処理の普及**
   - データ変換のパイプライン化
   - 関数合成の活用
   - 中間変数の削減

2. **型に基づく設計の徹底**
   - 代数的データ型によるドメインモデリング
   - 型安全なエラーハンドリング
   - パターンマッチングの活用

3. **パフォーマンス最適化**
   - メモ化の導入
   - 遅延評価パターンの適用（必要に応じて）
   - 再帰処理の最適化

## テスト戦略

関数型プログラミングを効果的にテストするためのアプローチ：

1. **純粋関数のユニットテスト**
   - 入力と期待される出力の組み合わせテスト
   - プロパティベースドテスト（fast-checkなど）
   - 境界条件のテスト

2. **副作用を持つ関数のテスト**
   - モックを使った外部依存のシミュレーション
   - テスト用のロガー、ファイルシステム、DBのモック実装
   - 統合テスト

3. **型レベルテスト**
   - TypeScriptの型チェックによる静的検証
   - ランタイム型バリデーションのテスト
   - エッジケースのカバレッジ

## 期待される成果

関数型プログラミングの原則を適用することで、以下の成果が期待されます：

1. **コードの予測可能性向上**
   - 副作用が明示的になり、予期せぬ動作が減少
   - 状態変更が制御され、バグが発生しにくくなる

2. **テスト性の向上**
   - 純粋関数は入出力のみに依存するため、テストが容易
   - モックの必要性が減少

3. **コードの可読性向上**
   - 宣言的なスタイルにより、「何をするか」が明確に
   - 副作用の分離により、コアロジックが理解しやすく

4. **保守性の向上**
   - 小さな関数の組み合わせにより、変更の影響範囲が局所化
   - 型安全性により、リファクタリング時の安全性が向上

5. **並行処理の安全性向上**
   - 不変データ構造により、並行処理時の予期せぬ挙動が減少
   - 副作用の制御により、非同期処理のバグが減少
