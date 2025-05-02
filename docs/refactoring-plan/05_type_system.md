# 型システムの改善

## 現状の問題点

現在のbookmeterプロジェクトでは、TypeScriptの型システムが十分に活用されておらず、以下のような問題が見られます：

### 1. 型アサーションの多用

- 型アサーション(`as`)が頻繁に使用され、型安全性が損なわれている
- コンパイル時の型チェックを回避している箇所がある
- ランタイムでの型エラーリスクが高まっている

```typescript
// 型アサーションの例
const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN;

const value = (await ps.wait(5)) as false | { bookmeterUrl: string; updatedBook: Book };

const parsedResult = fxp.parse(response.data) as NdlResponseJson;
```

### 2. 型定義の複雑さと曖昧さ

- `Book`型が多くのプロパティを持ち、関心事が混在している
- インデックス型や条件型が複雑に組み合わされており、理解が難しい
- API応答型の定義が不正確または不完全

```typescript
// 複雑で関心事が混在したBook型の例
export type Book = {
  bookmeter_url: string;
  isbn_or_asin: ISBN10 | ASIN;
  book_title: string;
  author: string;
  publisher: string;
  published_date: string;
} & {
  [key in OpacLink]: string;
} & {
  [key in ExistIn]: "Yes" | "No";
} & {
  sophia_mathlib_opac: string;
  description: string;
};

// インデックス型の例
export type ExistIn = `exist_in_${CiniiTargetOrgs}`;
export type OpacLink = `${Lowercase<CiniiTargetOrgs>}_opac`;
```

### 3. ランタイム型検証の欠如

- APIや外部データからの入力に対するランタイム型検証が不足している
- 想定外の形式のデータが処理されると、実行時エラーが発生する可能性がある
- 型が期待する構造と実際のデータの構造の不一致を検出する仕組みがない

```typescript
// APIレスポンスをそのまま使用する例（型検証なし）
function fetchNDL(book: Book, useIsbn: boolean = true): Promise<BookSearchState> {
  // APIリクエスト処理...
  
  const parsedResult = fxp.parse(response.data) as NdlResponseJson; //xmlをjsonに変換
  const ndlResp = parsedResult.rss.channel;
  
  // 型検証なしでデータにアクセス
  if ("item" in ndlResp) {
    const bookinfo = Array.isArray(ndlResp.item) ? ndlResp.item[0] : ndlResp.item;
    // 以下、bookinfo.propertyが存在することを前提に処理
  }
}
```

### 4. Union型とDiscriminated Unionの未活用

- 成功/失敗状態などの表現に単純なブール値フラグを使用している
- より表現力のあるDiscriminated Union型が活用されていない
- 型による状態管理が不十分で、不整合が生じやすい

```typescript
// ブール値フラグを使用した例
export type BookSearchState = { book: Book; isFound: boolean };
export type BookOwningStatus = { book: Book; isFound?: boolean; isOwning: boolean };

// 非効率な条件分岐
if (!updatedSearchState.isFound) {
  updatedSearchState = await fetchNDL(updatedSearchState.book);
}
```

### 5. Any型と型不明瞭なコード

- `any`型の使用や暗黙的な`any`型の箇所がある
- 型パラメータのない汎用関数やユーティリティが存在する
- 型推論に頼りすぎており、明示的な型注釈が不足している

```typescript
// anyの使用例
function logAxiosError(error: unknown, apiName: string, context?: string): void {
  // errorがunknownとして扱われるが、適切な型ガードがない
}

// 型パラメータのない汎用関数の例（推測）
function PromiseQueue() {
  // 型パラメータがなく、内部で扱う値の型が不明確
}
```

## 提案する改善策

### 1. 型アサーションの削減と型ガードの導入

型アサーションを削減し、代わりに型安全なアプローチを導入します。

#### a. 型ガード関数の実装

```typescript
// domain/utils/typeGuards.ts
export function isISBN10(value: unknown): value is ISBN10 {
  return typeof value === 'string' && /^[0-9]{9}[0-9X]$/.test(value);
}

export function isASIN(value: unknown): value is ASIN {
  return typeof value === 'string' && /^[A-Z0-9]{10}$/.test(value) && !isISBN10(value);
}

export function isBook(value: unknown): value is Book {
  return (
    value !== null &&
    typeof value === 'object' &&
    'bookmeter_url' in value &&
    'isbn_or_asin' in value &&
    'book_title' in value &&
    'author' in value
  );
}

export function isNdlResponseWithItems(
  response: NdlResponseJson
): response is NdlResponseWithItems {
  return (
    response &&
    response.rss &&
    response.rss.channel &&
    'item' in response.rss.channel
  );
}
```

#### b. 型アサーションからの移行

```typescript
// Before
const amzn = matchASIN(amzn_raw) as ISBN10 | ASIN;
if (isIsbn10(amzn)) {
  // 処理...
}

// After
const amzn = matchASIN(amzn_raw);
if (isISBN10(amzn)) {
  // この中では amzn が ISBN10 型として扱われる
} else if (isASIN(amzn)) {
  // この中では amzn が ASIN 型として扱われる
} else {
  // 有効なISBN10またはASINでない場合
  throw new ValidationError('Invalid ISBN or ASIN', 'isbn_or_asin', amzn_raw);
}
```

#### c. 型安全なAPIクライアント

```typescript
// infrastructure/adapters/apis/openBdApi.ts
export class OpenBdApiClient {
  async fetchBookInfo(isbn: string): Promise<Either<ApiError, OpenBD.Response>> {
    try {
      const response = await axios.get<unknown>(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      
      // レスポンスを検証
      if (!this.isValidOpenBdResponse(response.data)) {
        return left(new ApiError(
          'Invalid OpenBD API response format',
          400,
          `https://api.openbd.jp/v1/get?isbn=${isbn}`
        ));
      }
      
      return right(response.data);
    } catch (error) {
      if (isAxiosError(error)) {
        return left(new ApiError(
          `OpenBD API request failed: ${error.message}`,
          error.response?.status,
          `https://api.openbd.jp/v1/get?isbn=${isbn}`,
          error
        ));
      }
      
      return left(new ApiError(
        `OpenBD API unknown error: ${String(error)}`,
        undefined,
        `https://api.openbd.jp/v1/get?isbn=${isbn}`,
        error
      ));
    }
  }
  
  private isValidOpenBdResponse(data: unknown): data is OpenBD.Response {
    if (!Array.isArray(data)) return false;
    
    // OpenBD APIは空の配列または null を含む配列を返すことがある
    for (const item of data) {
      if (item !== null && (typeof item !== 'object' || !('summary' in item))) {
        return false;
      }
    }
    
    return true;
  }
}
```

### 2. ドメインモデルの再設計

型の関心事を分離し、より表現力のあるドメインモデルを設計します。

#### a. 基本的なドメインエンティティの定義

```typescript
// domain/models/valueObjects.ts
export type ISBN10 = Brand<string, 'ISBN10'>;
export type ISBN13 = Brand<string, 'ISBN13'>;
export type ASIN = Brand<string, 'ASIN'>;

export type BookIdentifier = ISBN10 | ISBN13 | ASIN;

// domain/models/book.ts
export interface BookBase {
  readonly id: string;
  readonly identifier: BookIdentifier;
  readonly title: string;
  readonly author: string;
  readonly publisher?: string;
  readonly publishedDate?: string;
  readonly description?: string;
}

// 図書館情報を扱う独立した型
export interface LibraryInfo {
  readonly existsIn: {
    readonly sophia: boolean;
    readonly uTokyo: boolean;
    readonly [key: string]: boolean;
  };
  readonly opacLinks: {
    readonly sophia?: string;
    readonly uTokyo?: string;
    readonly sophiaMathLib?: string;
    readonly [key: string]: string | undefined;
  };
}

// 統合型
export interface Book extends BookBase {
  readonly libraryInfo: LibraryInfo;
}

// BookList型をReadonlyMapに変更
export type BookList = ReadonlyMap<string, Book>;
```

#### b. Discriminated Union型の活用

```typescript
// domain/models/result.ts
export type BookSearchResult = 
  | { readonly status: 'found'; readonly book: Book }
  | { readonly status: 'not_found'; readonly reason: string }
  | { readonly status: 'error'; readonly error: ApiError };

// domain/models/apiResponse.ts
export type ApiResponse<T> =
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'not_found' }
  | { readonly status: 'error'; readonly error: ApiError };

// 使用例
async function fetchBookInfo(isbn: string): Promise<BookSearchResult> {
  try {
    const response = await openBdClient.fetchBookInfo(isbn);
    
    if (isRight(response)) {
      const data = response.right;
      
      if (!data[0]) {
        return { status: 'not_found', reason: 'Book not found in OpenBD' };
      }
      
      return {
        status: 'found',
        book: mapOpenBdResponseToBook(data[0])
      };
    } else {
      return {
        status: 'error',
        error: response.left
      };
    }
  } catch (error) {
    return {
      status: 'error',
      error: normalizeError(error)
    };
  }
}

// 呼び出し側
const result = await fetchBookInfo(isbn);

switch (result.status) {
  case 'found':
    // 書籍情報が見つかった場合の処理
    return result.book;
  
  case 'not_found':
    // 書籍が見つからなかった場合の処理
    logger.warn(`Book not found: ${result.reason}`);
    return null;
  
  case 'error':
    // エラーが発生した場合の処理
    logger.error(`Error fetching book: ${result.error.message}`);
    throw result.error;
}
```

### 3. ランタイム型検証の導入

外部データや入力の検証を強化し、実行時の型安全性を向上させます。

#### a. zodによる型検証スキーマの定義

```typescript
// domain/schemas/book.ts
import { z } from 'zod';

// ISBN10検証用の正規表現
const isbn10Regex = /^[0-9]{9}[0-9X]$/;
const isbn13Regex = /^97[89][0-9]{10}$/;
const asinRegex = /^[A-Z0-9]{10}$/;

// ISBN10のスキーマ
export const ISBN10Schema = z.string().refine(
  (val) => isbn10Regex.test(val),
  { message: 'Invalid ISBN-10 format' }
);

// ISBN13のスキーマ
export const ISBN13Schema = z.string().refine(
  (val) => isbn13Regex.test(val),
  { message: 'Invalid ISBN-13 format' }
);

// ASINのスキーマ
export const ASINSchema = z.string().refine(
  (val) => asinRegex.test(val) && !isbn10Regex.test(val),
  { message: 'Invalid ASIN format' }
);

// BookIdentifierのスキーマ
export const BookIdentifierSchema = z.union([
  ISBN10Schema,
  ISBN13Schema,
  ASINSchema
]);

// 基本的な書籍情報のスキーマ
export const BookBaseSchema = z.object({
  id: z.string(),
  identifier: BookIdentifierSchema,
  title: z.string().min(1),
  author: z.string(),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional()
});

// 図書館情報のスキーマ
export const LibraryInfoSchema = z.object({
  existsIn: z.record(z.boolean()),
  opacLinks: z.record(z.string().optional())
});

// 完全な書籍情報のスキーマ
export const BookSchema = BookBaseSchema.extend({
  libraryInfo: LibraryInfoSchema
});

// OpenBD APIレスポンススキーマ
export const OpenBDSummarySchema = z.object({
  isbn: z.string(),
  title: z.string(),
  volume: z.string().optional(),
  series: z.string().optional(),
  publisher: z.string().optional(),
  pubdate: z.string().optional(),
  cover: z.string().url().optional(),
  author: z.string().optional()
});

export const OpenBDItemSchema = z.object({
  summary: OpenBDSummarySchema.nullable().optional()
}).nullable();

export const OpenBDResponseSchema = z.array(OpenBDItemSchema);

// 型を生成
export type Book = z.infer<typeof BookSchema>;
export type BookBase = z.infer<typeof BookBaseSchema>;
export type LibraryInfo = z.infer<typeof LibraryInfoSchema>;
export type BookIdentifier = z.infer<typeof BookIdentifierSchema>;
export type ISBN10 = z.infer<typeof ISBN10Schema>;
export type ISBN13 = z.infer<typeof ISBN13Schema>;
export type ASIN = z.infer<typeof ASINSchema>;
```

#### b. APIレスポンスの検証

```typescript
// infrastructure/adapters/apis/base/validateResponse.ts
import { z } from 'zod';
import { ApiError } from '../../../../domain/errors/apiError';
import { ValidationError } from '../../../../domain/errors/validationError';
import { Either, left, right } from '../../../../domain/utils/either';

export async function validateResponse<T>(
  promise: Promise<unknown>,
  schema: z.ZodType<T>,
  endpoint: string
): Promise<Either<ApiError, T>> {
  try {
    const response = await promise;
    
    try {
      // zodを使ってレスポンスを検証
      const validatedData = schema.parse(response);
      return right(validatedData);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return left(new ValidationError(
          `Invalid API response format from ${endpoint}: ${validationError.message}`,
          'response',
          response,
          validationError
        ));
      }
      
      return left(new ApiError(
        `Unknown validation error for response from ${endpoint}: ${String(validationError)}`,
        400,
        endpoint,
        validationError
      ));
    }
  } catch (error) {
    if (isAxiosError(error)) {
      return left(new ApiError(
        `API request to ${endpoint} failed: ${error.message}`,
        error.response?.status,
        endpoint,
        error
      ));
    }
    
    return left(new ApiError(
      `Unknown error during API request to ${endpoint}: ${String(error)}`,
      undefined,
      endpoint,
      error
    ));
  }
}

// 使用例
import { OpenBDResponseSchema } from '../../../../domain/schemas/book';

async function fetchOpenBdData(isbn: string): Promise<Either<ApiError, OpenBD.Response>> {
  const endpoint = `https://api.openbd.jp/v1/get?isbn=${isbn}`;
  
  return validateResponse(
    axios.get(endpoint).then(res => res.data),
    OpenBDResponseSchema,
    endpoint
  );
}
```

#### c. ユーザー入力のバリデーション

```typescript
// presentation/cli/validators/inputValidator.ts
import { z } from 'zod';
import { ValidationError } from '../../../domain/errors/validationError';

// CLIコマンド引数のバリデーション
export function validateUserId(userId: unknown): string {
  const schema = z.string().min(1).max(20);
  
  try {
    return schema.parse(userId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid user ID: ${error.errors[0].message}`,
        'userId',
        userId,
        error
      );
    }
    
    throw error;
  }
}

export function validateMode(mode: unknown): 'wish' | 'stacked' {
  const schema = z.union([z.literal('wish'), z.literal('stacked')]);
  
  try {
    return schema.parse(mode);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid mode: ${error.errors[0].message}, must be either 'wish' or 'stacked'`,
        'mode',
        mode,
        error
      );
    }
    
    throw error;
  }
}

// 使用例
export class WishCommand extends BaseCommand {
  async execute(args: string[]): Promise<void> {
    try {
      // 引数のバリデーション
      const userId = args[0] ? validateUserId(args[0]) : BOOKMETER_DEFAULT_USER_ID;
      
      // 処理の実行
      const result = await this.getWishBookListUseCase.execute({ userId });
      
      // 出力処理...
    } catch (error) {
      // エラーハンドリング...
    }
  }
}
```

### 4. 型安全なユーティリティとヘルパー関数

汎用的なユーティリティ関数の型安全性を向上させます。

#### a. ジェネリックユーティリティ関数

```typescript
// domain/utils/collections.ts
export function mapToArray<K, V, R>(map: ReadonlyMap<K, V>, transform: (value: V, key: K) => R): R[] {
  return Array.from(map.entries(), ([key, value]) => transform(value, key));
}

export function addToMap<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  const newMap = new Map(map);
  newMap.set(key, value);
  return newMap;
}

export function removeFromMap<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  const newMap = new Map(map);
  newMap.delete(key);
  return newMap;
}

export function filterMap<K, V>(
  map: ReadonlyMap<K, V>,
  predicate: (value: V, key: K) => boolean
): ReadonlyMap<K, V> {
  const newMap = new Map<K, V>();
  
  for (const [key, value] of map.entries()) {
    if (predicate(value, key)) {
      newMap.set(key, value);
    }
  }
  
  return newMap;
}

// 使用例
const booksArray = mapToArray(bookList, book => ({
  title: book.title,
  author: book.author,
  isbn: book.identifier
}));

const filteredBooks = filterMap(bookList, book => isISBN10(book.identifier));
```

#### b. 型安全な非同期ユーティリティ

```typescript
// infrastructure/utils/async.ts
export class Limiter<T = void> {
  private queue: Array<() => Promise<T>> = [];
  private running = 0;
  
  constructor(private readonly concurrency: number) {}
  
  async add<R extends T>(fn: () => Promise<R>): Promise<R> {
    // 実装...
  }
  
  // ...
}

// ジェネリック型を持つPromiseQueue
export class PromiseQueue<T> {
  private queue: Array<() => Promise<T>> = [];
  private results: T[] = [];
  private running = 0;
  
  add(fn: () => Promise<T>): void {
    this.queue.push(fn);
  }
  
  async wait(maxConcurrent: number): Promise<T[]> {
    // 実装...
  }
  
  async all(): Promise<T[]> {
    // 実装...
  }
}

// 使用例
const queue = new PromiseQueue<Book>();

for (const url of bookUrls) {
  queue.add(() => scrapeBook(url));
}

const books = await queue.all();
```

#### c. 型安全なファイル操作

```typescript
// infrastructure/utils/file.ts
import { z } from 'zod';

export async function readJsonFile<T>(
  path: string,
  schema: z.ZodType<T>
): Promise<Either<Error, T>> {
  try {
    const data = await readFile(path, 'utf-8');
    const json = JSON.parse(data);
    
    try {
      const validated = schema.parse(json);
      return right(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return left(new ValidationError(
          `Invalid data in file ${path}: ${error.message}`,
          'fileContent',
          json,
          error
        ));
      }
      
      return left(new Error(`Validation error: ${String(error)}`));
    }
  } catch (error) {
    return left(new Error(`Failed to read or parse file ${path}: ${String(error)}`));
  }
}

export async function writeJsonFile<T>(
  path: string,
  data: T
): Promise<Either<Error, void>> {
  try {
    await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
    return right(undefined);
  } catch (error) {
    return left(new Error(`Failed to write file ${path}: ${String(error)}`));
  }
}
```

### 5. 外部APIの型定義の改善

外部APIとの連携をより型安全に行うための型定義を改善します。

#### a. OpenBD API型定義の改善

```typescript
// infrastructure/adapters/apis/openBd/types.ts
export namespace OpenBD {
  export interface Summary {
    readonly isbn: string;
    readonly title: string;
    readonly volume?: string;
    readonly series?: string;
    readonly publisher?: string;
    readonly pubdate?: string;
    readonly cover?: string;
    readonly author?: string;
  }
  
  export interface TextContent {
    readonly TextType: string;
    readonly ContentAudience: string;
    readonly Text: string;
  }
  
  export interface CollateralDetail {
    readonly TextContent?: ReadonlyArray<TextContent>;
  }
  
  export interface OpenBDItem {
    readonly summary?: Summary | null;
    readonly onix?: {
      readonly CollateralDetail?: CollateralDetail;
    };
  }
  
  export type Response = ReadonlyArray<OpenBDItem | null>;
  
  // 型ガード
  export function isOpenBDItem(item: unknown): item is OpenBDItem {
    return (
      item !== null &&
      typeof item === 'object' &&
      'summary' in item
    );
  }
  
  export function hasDescription(item: OpenBDItem): boolean {
    return (
      item.onix !== undefined &&
      item.onix.CollateralDetail !== undefined &&
      Array.isArray(item.onix.CollateralDetail.TextContent) &&
      item.onix.CollateralDetail.TextContent.length > 0
    );
  }
}
```

#### b. NDL API型定義の改善

```typescript
// infrastructure/adapters/apis/ndl/types.ts
export namespace NDL {
  export interface BookItem {
    readonly title: string;
    readonly "dcndl:seriesTitle"?: string;
    readonly "dcndl:volume"?: string;
    readonly author?: string;
    readonly "dc:publisher"?: string;
    readonly pubDate?: string;
  }
  
  export interface ResponseWithItems {
    readonly rss: {
      readonly channel: {
        readonly item: BookItem | ReadonlyArray<BookItem>;
      };
    };
  }
  
  export interface ResponseWithoutItems {
    readonly rss: {
      readonly channel: {
        readonly "opensearch:totalResults": string;
        readonly "opensearch:startIndex": string;
        readonly "opensearch:itemsPerPage": string;
      };
    };
  }
  
  export type Response = ResponseWithItems | ResponseWithoutItems;
  
  // 型ガード
  export function hasItems(response: Response): response is ResponseWithItems {
    return (
      'rss' in response &&
      'channel' in response.rss &&
      'item' in response.rss.channel
    );
  }
  
  export function getItems(response: ResponseWithItems): ReadonlyArray<BookItem> {
    const { item } = response.rss.channel;
    return Array.isArray(item) ? item : [item];
  }
}
```

## 実装戦略

型システムの改善は、以下のステップで段階的に実施します：

### フェーズ1: ドメインモデルの再設計（週1-2）

1. **基本的な型定義の再設計**
   - 純粋なドメインモデルの作成
   - 関心事の分離に基づいた型設計
   - 型ガード関数の実装

2. **Discriminated Union型の導入**
   - 結果型の設計
   - API応答型の設計
   - エラータイプの設計

3. **zodライブラリのセットアップ**
   - 依存関係の追加
   - 基本スキーマの定義
   - 検証ユーティリティの実装

### フェーズ2: API型定義の改善（週3-4）

1. **外部API型定義の整理**
   - OpenBD API型の再定義
   - NDL API型の再定義
   - GoogleBooks API型の再定義

2. **API応答の検証関数実装**
   - 検証パイプラインの構築
   - エラーマッピングの実装
   - テストケースの作成

### フェーズ3: 型アサーションの削減（週5）

1. **型ガードを使用したリファクタリング**
   - 型アサーションの特定
   - 型ガードへの置き換え
   - 置き換え困難な箇所の分析と対策

2. **型安全なユーティリティへの移行**
   - ジェネリックユーティリティ関数の実装
   - 既存コードの移行
   - テストの拡充

### フェーズ4: ランタイム型検証の導入（週6-7）

1. **入力検証パイプラインの構築**
   - CLI入力の検証実装
   - 設定値の検証実装
   - ファイル入出力の検証実装

2. **既存コードへの組み込み**
   - 段階的な導入計画の作成
   - 優先度の高い部分からの適用
   - テスト検証

## テスト戦略

型システムの改善を効果的にテストするためのアプローチ：

1. **単体テスト**
   - 型ガード関数のテスト
   - スキーマ検証のテスト
   - ユーティリティ関数のテスト

2. **プロパティベースドテスト**
   - ランダムなデータを生成し、型検証の挙動を検証
   - エッジケースのカバレッジ確認
   - fast-checkなどのライブラリを活用

3. **統合テスト**
   - API連携の型安全性検証
   - エラーハンドリングとの連携検証
   - 実環境のデータサンプルを用いた検証

4. **コンパイル時チェック**
   - TypeScriptコンパイラオプションの強化
   - strict: trueの有効化
   - noImplicitAnyの有効化

## 期待される成果

型システムの改善により、以下の成果が期待されます：

1. **バグの減少**
   - 型エラーに起因する実行時バグの減少
   - 早期の問題発見によるコード品質の向上
   - ランタイムエラーの大幅な削減

2. **コードの可読性と保守性の向上**
   - 明示的で自己文書化された型定義による理解しやすいコード
   - 型による強力なナビゲーションとリファクタリングサポート
   - 意図の明確な表現による共同作業の効率化

3. **開発効率の向上**
   - IDEの型推論と入力補完の強化による生産性向上
   - 変更影響範囲の事前把握能力の向上
   - 新機能追加時のエラー検出の迅速化

4. **堅牢なAPIインテグレーション**
   - 外部APIとの連携における型安全性の向上
   - 予期せぬ形式のデータに対する耐性強化
   - ランタイム検証によるデータ整合性の保証

5. **メンテナンス性の向上**
   - コード理解の迅速化
   - リファクタリングの安全性向上
   - 新規開発者のオンボーディング容易化

6. **テスト範囲の最適化**
   - 型システムによって捕捉されるバグの削減によるテスト対象の絞り込み
   - より価値の高いロジックテストへのリソース集中
   - ビジネスロジックの正確性検証への注力
