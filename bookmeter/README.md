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

# ローカルキャッシュから API 補強を再実行（API取得 → DB保存 → CSV出力 → アップロード）
tsx bookmeter/src/index.ts local-biblio wish

# キャッシュを無視して書誌・所蔵・説明文を強制更新
tsx bookmeter/src/index.ts full wish --force

# ユーザーIDを指定して実行
tsx bookmeter/src/index.ts full wish --user-id 42
```

### 実行モード

| モード | 説明 |
|--------|------|
| `full` | スクレイピングから全フェーズを実行 |
| `scrape-only` | スクレイピングのみ実行し、下流フェーズをスキップ |
| `local-downstream` | スクレイピングをスキップし、ローカルキャッシュからDB保存・CSV出力・アップロードを実行 |
| `local-biblio` | Bookmeter/紀伊國屋のスクレイピングをスキップし、ローカルキャッシュからAPI取得・DB保存・CSV出力・アップロードを実行 |

`--force` を付けると、既存の SQLite キャッシュを使わずに書誌情報、CiNii 所蔵情報、紀伊國屋の説明文を再取得する。通常実行では、既知の書籍に対する再取得を避ける。

#### 各モードの有効フェーズ

| フェーズ | `full` | `scrape-only` | `local-downstream` | `local-biblio` |
|---|:---:|:---:|:---:|:---:|
| scrape（データ取得元） | remote | remote | local-cache | local-cache |
| compare | o | - | - | - |
| fetchBiblio | o | - | - | o |
| crawlDescriptions | o | - | - | - |
| persist | o | - | o | o |
| exportCsv | o | - | o | o |
| uploadDb | o | - | o | o |

#### `--force` の有無によるキャッシュ挙動

| フェーズ | `--force` なし | `--force` あり |
|---|---|---|
| **compare** | 前回スナップショットと比較し、差分がなければ後続フェーズをスキップ | 比較結果に関係なく後続フェーズを常に実行 |
| **fetchBiblio — 書誌情報** | `book_title`, `author`, `publisher`, `published_date` の4項目がすべて有効値ならスキップ（空文字・`Not_found_in_*`・`*_API_Error`・`INVALID_ISBN` は欠損扱い） | 全書籍を無条件で再取得 |
| **fetchBiblio — 所蔵検索** | `cachedBookUrls`（DB上の wish+stacked を結合した URL セット）に含まれていればスキップ | 全書籍を無条件で再検索 |
| **crawlDescriptions** | DBに既存の説明文があれば再利用し、新規書籍のみ紀伊國屋から取得 | 既存の説明文があっても再取得 |
| **persist / exportCsv / uploadDb** | キャッシュ判定なし（常に実行） | 同左 |

#### `--force` を使う基準

URL 列の追加・削除・並び替えを検知するだけなら、通常は `--force` を使わない。`full` は毎回 Bookmeter の一覧をスクレイピングし、前回スナップショットと現在の `bookmeter_url` の集合および順序を比較するため、キャッシュを長期間使っていても URL 列の差分は検知できる。ただし、同じ URL 列に戻った途中経過や、同じ `bookmeter_url` のまま変わった書誌情報・所蔵情報・説明文は、URL 列の差分としては扱わない。この区別を前提に、`--force` は URL 列ではなく下流データを再取得したい時に使う。

`--force` を使う主な場面は、既存書籍の書誌情報を API から取り直したい時、CiNii 所蔵情報を再検索したい時、紀伊國屋の説明文を既存書籍も含めて更新したい時、またはキャッシュ済みデータに誤りがあると分かっている時である。通常の追加・削除・並び替えに対しては `full` の通常実行で足りる。Bookmeter を再スクレイピングせずにローカルスナップショットの書誌・所蔵だけを再取得したい場合は、`local-biblio --force` を使う。次に、モードごとの具体的な挙動をまとめる。

#### モード別まとめ

| モード | `--force` なし | `--force` あり |
|---|---|---|
| **full** | remote スクレイプ → 差分なしなら停止。差分ありなら未取得分のみAPI・所蔵検索、新規書籍のみ説明文取得 → 保存・出力 | remote スクレイプ → 比較を無視して全書籍の書誌・所蔵・説明文を再取得 → 保存・出力 |
| **scrape-only** | remote スクレイプのみ。後続フェーズなし | 同左（`--force` の効果なし） |
| **local-downstream** | 前回スナップショットをそのまま保存・CSV出力・アップロード | 同左（`--force` の効果なし） |
| **local-biblio** | 前回スナップショットに対し、未取得分のみ書誌・所蔵検索 → 保存・CSV出力・アップロード | 前回スナップショットに対し、全書籍の書誌・所蔵を再取得 → 保存・CSV出力・アップロード |

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
