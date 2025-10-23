# Bookmeter Refactoring Plan

作成日: 2025-10-22
対象: `bookmeter` ディレクトリ一式

---

## 1. 背景とゴール
- 現状コードは CLI エントリ内に多層のロジックが内包され、テスト容易性・責務分離・再利用性が低い。
- 外部 API / スクレイピング / DB / ファイル出力など異質な関心事が密結合しており、障害時の影響範囲が大きい。
- ゴールは、クリーンアーキテクチャ（ヘキサゴナルを参考）相当のレイヤリングを導入し、ユースケース単位でテスト可能・保守容易な構造に整理すること。

## 2. 現状構造の整理
| ファイル | 主な責務 | 課題 |
| --- | --- | --- |
| `index.ts` | CLI 引数処理、ブラウザ起動、差分検知、書誌情報取得、SQLite 同期、CSV 書き出し、Firebase アップロード | 単一ファイルに業務ロジックが集中、例外ハンドリングが CLI に埋め込み、`process.exit` 直呼びで拡張困難 |
| `bookmaker.ts` | Puppeteer で Bookmeter をクロールし `Book` Map を構築 | Puppeteer 操作とドメイン構築の密結合、環境変数アクセスが散在 |
| `fetchers.ts` | OpenBD / ISBNdb / NDL / GoogleBooks / CiNii / Sophia Math Library 連携 | 異なる API プロトコル・遅延制御・エラーハンドリングを単一モジュールに内包 |
| `sqlite.ts` | Map ⇔ SQLite 同期、CSV エクスポート、記述登録チェック | リポジトリ抽象化がなくアプリ層から直接利用される。ユースケース把握が困難 |
| `kinokuniya.ts` | Kinokuniya スクレイピング + SQLite 描写更新 | Puppeteer/SQLite 混在、`BookList` Map 前提で柔軟性が低い |
| `firebase.ts` | Firebase Storage アップロード | 設定注入がなく単体テスト困難 |
| `utils.ts` | CSV 読込、ダイフ計算、ISBN 変換など | 入出力とドメインユーティリティが同居 |

## 3. ターゲットアーキテクチャ
```
interfaces/
  cli/ (モード毎のエントリ)
application/
  usecases/ (例: SyncWishListUseCase)
  services/ (差分判定、書誌情報更新など)
domain/
  entities/Book.ts
  repositories/BookRepository.ts (インターフェース)
  services/BookListDiffService.ts
infrastructure/
  scraping/BookmeterScraper.ts (Puppeteer 実装)
  scraping/KinokuniyaScraper.ts
  http/ (各 API ゲートウェイ)
  persistence/SqliteBookRepository.ts
  messaging/FirebaseUploader.ts
  config/EnvConfigProvider.ts
shared/
  logging/Logger.ts
  time/Clock.ts
```

### 3.1 レイヤ別責務
- **Domain**: `Book` エンティティ、`BookList` 値オブジェクト、差分判定サービス、ISBN 変換など純粋ロジック。
- **Application**: ユースケースオーケストレーション（スクレイプ→差分→書誌→永続化→エクスポート）、トランザクション境界、例外変換。
- **Infrastructure**: Puppeteer や Axios、SQLite、Firebase の実装。アプリ層で定義したポート（インターフェース）を実装。
- **Interface (CLI)**: 引数 parsing、DI コンテナ初期化、アプリケーションユースケースの実行と終了コード管理。

## 4. フェーズ別リファクタリング手順

### フェーズ 0: 共通基盤整備
1. `shared/config` に `.env` 読み込みロジックを一元化 (`Config` インターフェース + `EnvConfig` 実装)。
2. `shared/logging` で単純な Logger インターフェースを定義し、既存 `console` 呼び出しを集約。
3. `domain/entities/Book.ts` を追加し、`types.ts` の構造体をクラス/型へ段階的移行。Map ベースの `BookList` は `BookCollection` としてラップ。

### フェーズ 1: アプリケーション層導入
1. `application/usecases/SyncWishListUseCase.ts`（wish/stacked 共通化）を作成。`execute(options)` がユースケース入口。
2. 既存 `main` をこのユースケース呼び出しへ置換。例外はアプリ層で `Result` 型等に変換し CLI で `process.exit` を決定。
3. 差分検知を `domain/services/BookListDiffService.ts` として切り出し、`isBookListDifferent` をラップ。

### フェーズ 2: リポジトリ抽象化
1. `domain/repositories/BookRepository.ts` を定義（メソッド例: `findAll(mode)`, `saveAll(mode, books)`, `deleteMissing(mode, books)`）。
2. `infrastructure/persistence/SqliteBookRepository.ts` で既存 `saveBookListToDatabase` / `loadBookListFromDatabase` を移植。`CSV` エクスポートも `CsvExporter` インターフェース化。
3. テスト用に `InMemoryBookRepository` を追加し、ユースケースのユニットテスト基盤を整備。

### フェーズ 3: スクレイピングと書誌取得の分離
1. `BookmeterScraper` と `KinokuniyaScraper` を `ScrapingService` インターフェース経由で提供 (`fetchWishList`, `fetchStackedList`, `enrichDescriptions`).
2. `fetchers.ts` の各 API を薄いゲートウェイ (`OpenBDGateway`, `ISBNdbGateway`, `NDLGateway`, `GoogleBooksGateway`, `CiNiiGateway`, `MathLibCatalog`) に分割。共通 HTTP ラッパを `infrastructure/http/HttpClient.ts` として抽象化。
3. 書誌情報更新は `application/services/BiblioInfoAggregator.ts` としてオーケストレートし、ゲートウェイ群を順序制御する。

### フェーズ 4: クロスカッティング改善
1. レート制御・待機ロジックを `shared/concurrency/PromiseQueue` へ再配置し、対 Puppeteer/HTTP 共通の制御を適用。
2. エラー種別ごとに独自例外を定義 (`DomainError`, `InfrastructureError`, `ExternalServiceError`)。ユースケース内でリトライやフォールバックを政策的に整理。
3. Firebase アップロードを `Uploader` インターフェースで抽象化し、将来の別ストレージ対応を容易化。

### フェーズ 5: インターフェース整理とモード拡張
1. CLI レイヤ (`interfaces/cli/bookmeter.ts`) を作成し、`parseArgv` を `yargs` 相当や自前パーサに移行。オプション検証もここで完結。
2. バッチ/スケジューラ対応を想定し、`interfaces/scheduler` や `application` レベルでシナリオを定義。
3. `main.ts` は CLI 起動だけに限定し、他インターフェース（HTTP API など）追加に備える。

## 5. ファイル/モジュール再配置マッピング
| 現行 | 移行先 | メモ |
| --- | --- | --- |
| `index.ts` | `interfaces/cli/bookmeter.ts`, `application/usecases/SyncBookmeterUseCase.ts` | CLI とユースケース本体に分割 |
| `bookmaker.ts` | `infrastructure/scraping/BookmeterScraper.ts` | Puppeteer 依存の実装として保持 |
| `kinokuniya.ts` | `infrastructure/scraping/KinokuniyaScraper.ts` | Repository 経由で書誌を更新 |
| `fetchers.ts` | `application/services/BiblioInfoAggregator.ts` + `infrastructure/http/gateways/*` | API ごとに分解し、順序制御をアプリ層で実装 |
| `sqlite.ts` | `infrastructure/persistence/SqliteBookRepository.ts`, `infrastructure/export/CsvExporter.ts` | テーブル同期・エクスポートを個別クラス化 |
| `firebase.ts` | `infrastructure/messaging/FirebaseUploader.ts` | 設定注入を `Config` から行う |
| `utils.ts` | `domain/services/IsbnService.ts`, `infrastructure/filesystem/CsvReader.ts` | 純粋ロジックと I/O を分離 |

## 6. テスト戦略
- **Domain**: Pure 関数・サービスは Jest などでユニットテスト（例: ISBN 変換、差分判定）。
- **Application**: ユースケースを InMemory リポジトリ & モックゲートウェイで検証。モードごとの分岐や例外ハンドリングを網羅。
- **Infrastructure**: Puppeteer 依存はスモークテストのみ。API ゲートウェイは HTTP モック（MSW など）でレスポンスを確認。
- **回帰**: CLI からの E2E テスト用に `scripts/run-bookmeter.sh` を整備し、主要フラグ（`noRemoteCheck`, `skipBookListComparison`, `skipFetchingBiblioInfo`）を検証。

## 7. リリースと移行リスク
- `.env` キーの再読み込み箇所変更に伴い、設定名の typo や未設定エラーが顕在化する可能性 → アプリ起動時のバリデーションを追加。
- SQLite スキーマは現状通りだが、テーブル作成タイミングが変わるためマイグレーションガード (`CREATE TABLE IF NOT EXISTS`) を維持。
- Puppeteer 設定を複数クラスで共有するため、`scraping` レイヤでブラウザインスタンス管理（ファクトリ/プール）を設計し直す必要あり。

## 8. 次のアクション候補
1. フェーズ 0 の Config/Logger/Domain Entities の骨格実装。
2. `SyncWishListUseCase` を導入し、`index.ts` から責務を抜き取るスパイクを作成。
3. テスト用に InMemory 実装を並行整備し、CI での最小ユニットテストを開始。

---
本計画に沿って段階的に責務を移行し、ユースケースごとのテスト容易性・保守性を高める。
