# アーキテクチャと責務の分離

## 現状の問題点

現在のbookmeterプロジェクトには、以下のようなアーキテクチャ上の問題が存在します：

### 1. 責務の混在

- **`index.ts`の責務過多**: メイン関数が下記のすべての処理を制御している
  - Puppeteerの初期化
  - Bookmeterからのデータ取得
  - 書誌情報の取得
  - データの差分比較
  - SQLiteへの保存
  - CSVエクスポート
  - Firebaseへのアップロード

- **`bookmaker.ts`の責務混在**: クラス内で以下が混在している
  - Puppeteerによるブラウザ操作
  - データ抽出と変換
  - 内部状態の管理

- **`fetchers.ts`の責務混在**: 関数内で以下が混在している
  - API呼び出し
  - レスポンスの解析
  - データ変換
  - エラー処理

### 2. モジュール間の密結合

- `kinokuniya.ts`が`sqlite.ts`に直接依存している
- 各モジュールが`constants.ts`に強く依存している
- ユーティリティ関数の散在

### 3. 明確なアーキテクチャパターンの欠如

- レイヤー構造が存在せず、データフローが追跡しにくい
- ビジネスロジックとインフラストラクチャコードが分離されていない
- 依存関係が明示的ではなく、間接的な依存が多い

## 提案するアーキテクチャ

### レイヤードアーキテクチャの導入

以下の4つの層からなるレイヤードアーキテクチャを導入します：

1. **ドメイン層**
   - ビジネスモデルとロジックを含む
   - 外部依存を持たない純粋なコード
   - 入出力のないコアロジック

2. **アプリケーション層**
   - ユースケースの実装
   - ドメイン層のオーケストレーション
   - 外部サービスへの依存は抽象インターフェースを介して行う

3. **インフラストラクチャ層**
   - 外部サービスとの連携実装（API、DB、ファイル、ブラウザ操作）
   - アプリケーション層で定義されたインターフェースの実装

4. **プレゼンテーション層**
   - CLIインターフェース
   - コマンドライン引数の解析
   - 出力フォーマット

### 新しいディレクトリ構造

```
bookmeter/
├── domain/                 # ドメイン層
│   ├── models/             # ドメインモデル
│   │   ├── book.ts         # 書籍エンティティ
│   │   └── ...
│   └── services/           # ドメインサービス
│       ├── biblioService.ts # 書誌情報関連のロジック
│       └── ...
├── application/            # アプリケーション層
│   ├── ports/              # ポートインターフェース
│   │   ├── input/          # 入力ポート（ユースケース）
│   │   └── output/         # 出力ポート（リポジトリ等）
│   └── usecases/           # ユースケース実装
│       ├── getBookListUseCase.ts
│       ├── fetchBiblioInfoUseCase.ts
│       └── ...
├── infrastructure/         # インフラストラクチャ層
│   ├── adapters/           # アダプタ実装
│   │   ├── repositories/   # リポジトリ実装
│   │   │   ├── sqliteBookRepository.ts
│   │   │   └── ...
│   │   ├── apis/           # API連携
│   │   │   ├── openBdApi.ts
│   │   │   ├── ndlApi.ts
│   │   │   └── ...
│   │   ├── scraping/       # スクレイピング
│   │   │   ├── bookmeterScraper.ts
│   │   │   └── ...
│   │   └── storage/        # ストレージ
│   │       ├── csvExporter.ts
│   │       ├── firebaseStorage.ts
│   │       └── ...
│   └── config/             # 設定
│       ├── environment.ts
│       └── ...
└── presentation/           # プレゼンテーション層
    ├── cli/                # CLIインターフェース
    │   ├── commands/       # コマンド
    │   └── ...
    └── index.ts            # エントリーポイント
```

## 実装ステップ

アーキテクチャの再構築は以下のステップで段階的に進めます：

### ステップ1: ドメイン層の実装（週3）

1. **ドメインモデルの定義**
   - `Book`、`BookList`などのエンティティ定義
   - 値オブジェクトの実装
   - ドメインロジックの抽出

```typescript
// domain/models/book.ts
export interface Book {
  id: BookId;
  title: string;
  author: string;
  isbn: ISBN;
  publisher?: string;
  publishedDate?: string;
  description?: string;
}

// domain/models/valueObjects.ts
export type BookId = string & { readonly _brand: unique symbol };
export type ISBN = string & { readonly _brand: unique symbol };

// domain/services/isbnService.ts
export function validateISBN(isbn: string): boolean {
  // ISBN検証ロジック
}

export function convertISBN10To13(isbn10: string): string {
  // 変換ロジック
}
```

2. **ドメインサービスの実装**
   - 書誌情報サービス
   - ISBNサービス
   - 書籍比較サービス

```typescript
// domain/services/bookComparisonService.ts
export interface BookComparisonService {
  compareBookLists(oldList: BookList, newList: BookList): BookListDiff;
}

export interface BookListDiff {
  added: Book[];
  removed: Book[];
  changed: { old: Book; new: Book }[];
}
```

### ステップ2: アプリケーション層の実装（週4）

1. **ポートの定義**
   - 入力ポート（ユースケース）
   - 出力ポート（リポジトリ等）

```typescript
// application/ports/output/bookRepository.ts
export interface BookRepository {
  findAll(type: "wish" | "stacked"): Promise<BookList>;
  save(books: BookList, type: "wish" | "stacked"): Promise<void>;
}

// application/ports/output/biblioInfoProvider.ts
export interface BiblioInfoProvider {
  fetchInfo(book: Book): Promise<Book>;
}
```

2. **ユースケースの実装**
   - GetWishBookListUseCase
   - FetchBiblioInfoUseCase
   - SaveBookListUseCase
   - ExportBookListUseCase

```typescript
// application/usecases/getWishBookListUseCase.ts
export class GetWishBookListUseCase {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly bookScraper: BookScraperService
  ) {}

  async execute(params: { userId: string; refresh: boolean }): Promise<BookList> {
    if (!params.refresh) {
      const storedBooks = await this.bookRepository.findAll("wish");
      if (storedBooks.size > 0) {
        return storedBooks;
      }
    }

    const scrapedBooks = await this.bookScraper.getWishBooks(params.userId);
    return scrapedBooks;
  }
}
```

### ステップ3: インフラストラクチャ層の実装（週5）

1. **リポジトリの実装**
   - SQLiteBookRepository
   - CsvBookRepository

```typescript
// infrastructure/adapters/repositories/sqliteBookRepository.ts
export class SqliteBookRepository implements BookRepository {
  constructor(private readonly dbPath: string) {}

  async findAll(type: "wish" | "stacked"): Promise<BookList> {
    // SQLiteからの取得実装
  }

  async save(books: BookList, type: "wish" | "stacked"): Promise<void> {
    // SQLiteへの保存実装
  }
}
```

2. **API連携の実装**
   - OpenBdApiClient
   - NdlApiClient
   - GoogleBooksApiClient

```typescript
// infrastructure/adapters/apis/openBdApi.ts
export class OpenBdApiClient implements BiblioInfoProvider {
  private readonly baseUrl = "https://api.openbd.jp/v1";

  async fetchInfo(book: Book): Promise<Book> {
    // OpenBD APIからの情報取得実装
  }
}
```

3. **スクレイピングの実装**
   - BookmeterScraper
   - KinokuniyaScraper

```typescript
// infrastructure/adapters/scraping/bookmeterScraper.ts
export class BookmeterScraper implements BookScraperService {
  constructor(private readonly browserFactory: BrowserFactory) {}

  async getWishBooks(userId: string): Promise<BookList> {
    // Bookmeterからのスクレイピング実装
  }
}
```

4. **ストレージの実装**
   - CsvExporter
   - FirebaseStorage

```typescript
// infrastructure/adapters/storage/csvExporter.ts
export class CsvExporter implements BookExporter {
  async export(books: BookList, path: string): Promise<void> {
    // CSV出力実装
  }
}
```

5. **設定の実装**
   - 環境変数読み込み
   - 設定の一元管理

```typescript
// infrastructure/config/environment.ts
export class Environment {
  static load(): AppConfig {
    // 環境変数の読み込みと検証
  }
}
```

### ステップ4: プレゼンテーション層の実装（週5）

1. **CLIコマンドの実装**
   - WishCommand
   - StackedCommand

```typescript
// presentation/cli/commands/wishCommand.ts
export class WishCommand {
  constructor(private readonly getWishBookListUseCase: GetWishBookListUseCase) {}

  async execute(args: { userId?: string; refresh?: boolean }): Promise<void> {
    // コマンド実行ロジック
  }
}
```

2. **エントリポイントの再実装**
   - 依存性注入の設定
   - コマンドライン引数の解析

```typescript
// presentation/index.ts
export async function main(args: string[]): Promise<void> {
  // DI設定
  const container = configureDependencies();

  // コマンド解析と実行
  const command = parseCommand(args);
  await command.execute();
}
```

### ステップ5: 既存コードからの段階的移行（週6-7）

1. **最小単位での移行**
   - 1つのユースケースずつ新アーキテクチャに移行
   - 継続的に既存機能の動作を検証

2. **既存コードと新コードの並行運用**
   - フラグで新旧コードを切り替え可能に
   - 段階的に新コードへの依存を増やす

3. **古いコードの削除**
   - すべての機能が新アーキテクチャに移行完了後に削除

## 依存関係の管理

### 依存性注入（DI）の導入

依存性を明示的に管理するためにDIを導入します：

```typescript
// infrastructure/di/container.ts
export function configureDependencies(): Container {
  const container = new Container();

  // リポジトリの登録
  container.bind<BookRepository>(TYPES.BookRepository)
    .to(SqliteBookRepository)
    .inSingletonScope();

  // APIクライアントの登録
  container.bind<BiblioInfoProvider>(TYPES.OpenBdApiClient)
    .to(OpenBdApiClient)
    .inTransientScope();

  // ユースケースの登録
  container.bind<GetWishBookListUseCase>(TYPES.GetWishBookListUseCase)
    .to(GetWishBookListUseCase)
    .inTransientScope();

  return container;
}
```

### インターフェースによる依存性逆転

各層の間の依存関係を制御するためにインターフェースを活用します：

```typescript
// application/ports/output/bookScraperService.ts
export interface BookScraperService {
  getWishBooks(userId: string): Promise<BookList>;
  getStackedBooks(userId: string): Promise<BookList>;
}

// infrastructureでの実装
export class BookmeterScraper implements BookScraperService {
  // 実装
}
```

## テスト戦略

新しいアーキテクチャでは、各層ごとにテストを作成します：

1. **ドメイン層のテスト**
   - 純粋関数のユニットテスト
   - モデルの振る舞いテスト

2. **アプリケーション層のテスト**
   - ユースケースのユニットテスト（モックを使用）
   - 統合テスト

3. **インフラストラクチャ層のテスト**
   - リポジトリのテスト（テストDBを使用）
   - APIクライアントのテスト（モックサーバーを使用）

4. **E2Eテスト**
   - 主要なユースケースのシナリオテスト

## 期待される成果

このアーキテクチャ再構築により、以下の成果が期待されます：

1. **責務の明確化**
   - 各モジュールが単一の責務を持ち、理解しやすくなる
   - 変更の影響範囲が局所化される

2. **テスタビリティの向上**
   - 各層が独立してテスト可能になる
   - モックやスタブを使ったテストが容易になる

3. **拡張性の向上**
   - 新機能追加時に既存コードへの影響を最小限に抑えられる
   - 代替実装の追加が容易になる（例：別のDBへの切り替え）

4. **コードの可読性向上**
   - 明確な構造によりコードナビゲーションが容易になる
   - 関心事の分離により各部分の理解が容易になる

5. **保守性の向上**
   - バグ修正が容易になる
   - リファクタリングの範囲が明確になる
