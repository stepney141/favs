# Bookmeter

[読書メーター](https://bookmeter.com/)の読みたい本リスト・積読リストをスクレイピングし、複数の書誌情報APIで補強したうえでSQLiteデータベースとCSVに出力するCLIツール。

## 主な機能

1. **スクレイピング** — Puppeteerで読書メーターにログインし、読みたい本/積読リストからISBN/ASINを抽出
2. **書誌情報の補強** — OpenBD一括検索をベースに、NDL（国立国会図書館）・ISBNdb・Google Booksへのフォールバックチェーンで書誌データを取得
3. **図書館所蔵検索** — CiNii Booksで上智大学・東京大学の所蔵状況とOPACリンクを取得。数学図書室の蔵書リストとも照合
4. **書籍説明文の取得** — 紀伊國屋書店Webサイトから書籍の説明文をクロール
5. **永続化** — SQLite（better-sqlite3 + Drizzle ORM）に保存
6. **CSV出力** — wishリストはOPACリンク・所蔵フラグ付き、stackedリストは基本情報のみ
7. **リモートアップロード** — Firebase StorageへSQLiteファイルをバックアップ

## 使い方

```bash
# フルパイプライン（スクレイピング → 書誌情報取得 → 説明文取得 → DB保存 → CSV出力 → アップロード）
tsx bookmeter/src/index.ts full wish

# スクレイピングのみ
tsx bookmeter/src/index.ts scrape-only stacked --no-login

# ローカルキャッシュから下流フェーズのみ実行（DB保存 → CSV出力 → アップロード）
tsx bookmeter/src/index.ts local-downstream wish

# ユーザーIDを指定して実行
tsx bookmeter/src/index.ts full wish --user-id 42
```

### 実行モード

| モード | 説明 |
|--------|------|
| `full` | スクレイピングから全フェーズを実行 |
| `scrape-only` | スクレイピングのみ実行し、下流フェーズをスキップ |
| `local-downstream` | スクレイピングをスキップし、ローカルキャッシュからDB保存・CSV出力・アップロードを実行 |

### ターゲット

| ターゲット | 説明 |
|------------|------|
| `wish` | 読みたい本リスト |
| `stacked` | 積読リスト |

## プロジェクト構成

```
bookmeter/
├── src/
│   ├── index.ts                # エントリポイント・DIオーケストレーション
│   ├── constants.ts            # 共通定数
│   ├── application/            # アプリケーション層（CLI解析・パイプライン制御）
│   │   ├── executionMode.ts    # CLI引数の解析と実行計画の解決
│   │   └── pipeline.ts         # パイプラインフェーズのオーケストレーション
│   ├── domain/                 # ドメイン層（純粋関数・外部依存なし）
│   │   ├── book.ts             # Bookエンティティ・BookList型・差分検出
│   │   └── isbn.ts             # ISBN/ASINの検証・変換
│   ├── db/                     # 永続化層
│   │   ├── schema.ts           # Drizzle ORMスキーマ定義
│   │   ├── client.ts           # DB接続管理
│   │   ├── bookRepository.ts   # リポジトリ（インターフェース + 実装）
│   │   ├── dataLoader.ts       # CSV/DBの読み込みユーティリティ
│   │   └── remoteUploader.ts   # Firebaseアップロードアダプタ
│   ├── fetchers/               # 外部API連携層
│   │   ├── index.ts            # フォールバックチェーン統合
│   │   ├── openbd.ts           # OpenBD一括ISBN検索
│   │   ├── ndl.ts              # 国立国会図書館API
│   │   ├── isbndb.ts           # ISBNdb API
│   │   ├── googlebooks.ts      # Google Books API
│   │   └── cinii.ts            # CiNii Books 所蔵検索
│   └── scrapers/               # Webスクレイピング層
│       ├── browser.ts          # ブラウザライフサイクル管理
│       ├── bookmaker.ts        # 読書メータースクレイパー
│       └── kinokuniya.ts       # 紀伊國屋書店 説明文スクレイパー
├── csv/                        # CSV出力先
├── books.sqlite                # SQLiteデータベース
└── mathlib_ja.txt              # 数学図書室の蔵書ISBNリスト
```

## データソース

| ソース | 用途 |
|--------|------|
| [読書メーター](https://bookmeter.com/) | 読みたい本・積読リストのスクレイピング元 |
| [OpenBD](https://openbd.jp/) | ISBN一括検索による書誌情報の取得 |
| [国立国会図書館サーチ](https://iss.ndl.go.jp/) | 書誌情報のフォールバック取得 |
| [ISBNdb](https://isbndb.com/) | 書誌情報のフォールバック取得 |
| [Google Books](https://books.google.com/) | 書誌情報のフォールバック取得 |
| [CiNii Books](https://ci.nii.ac.jp/books/) | 大学図書館の所蔵検索・OPACリンク取得 |
| [紀伊國屋書店](https://www.kinokuniya.co.jp/) | 書籍説明文のクロール |

## 主要な依存関係

- **puppeteer** / **puppeteer-extra** — Webスクレイピング・ブラウザ自動操作
- **axios** — HTTPクライアント
- **better-sqlite3** / **drizzle-orm** — SQLiteデータベース・ORM
- **firebase** — リモートストレージ
- **papaparse** — CSV解析
- **yargs** — CLI引数解析
- **inversify** — 依存性注入

## 環境変数

`.env` ファイルに以下のAPIキー・認証情報を設定する必要がある:

- `CINII_API_APPID` — CiNii Books APIのアプリケーションID
- `GOOGLE_BOOKS_API_KEY` — Google Books APIキー
- `ISBNDB_API_KEY` — ISBNdb APIキー
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` — Firebase設定
