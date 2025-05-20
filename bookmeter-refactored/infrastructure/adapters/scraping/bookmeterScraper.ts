import puppeteer from "puppeteer";

import { $x, waitForXPath } from "../../../../.libs/pptr-utils";
import { sleep } from "../../../../.libs/utils";

import { KinokuniyaScraper } from "./kinokuniyaScraper";

import type { BookScraperService } from "@/application/ports/output/bookScraperService";
import type { Logger } from "@/application/ports/output/logger";
import type { Book, BookList } from "@/domain/models/book";
import type { Result } from "@/domain/models/result";
import type { BookIdentifier, LibraryTag } from "@/domain/models/valueObjects";
import type { Browser, Page } from "puppeteer";

import { createBook, addBook } from "@/domain/models/book";
import { ScrapingError } from "@/domain/models/errors";
import { ok, err } from "@/domain/models/result";
import { createBookId, createISBN10, createASIN } from "@/domain/models/valueObjects";
import { isAsin, isIsbn10 } from "@/domain/services/isbnService";
import { getNodeProperty } from "@/infrastructure/utils/puppeteerUtils";

// BookmeterのURLフォーマット
const BOOKMETER_BASE_URI = "https://bookmeter.com";

// Chrome起動引数
const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
  "--lang=ja-JP,ja"
];

// XPath定義
const XPATH = {
  book: {
    amazonLink: "//a[img[@alt='Amazon']]",
    author: "//header/div[1]/ul/li",
    title: "//section[1]/header/div[1]/h1",
    registerStackedBook: '//*[@id="js-book-registration-button"]/li[3]',
    registerWishBook: '//*[@id="js-book-registration-button"]/li[4]'
  },
  stacked: {
    booksUrl: "//ul/li[*]/div[2]/div[2]/a"
  },
  wish: {
    login: {
      isBookExist: "/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li",
      booksUrl: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a",
      amazonLink: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[4]/a"
    },
    guest: {
      booksUrl: "//ul/li[*]/div[2]/div[2]/a"
    }
  },
  login: {
    accountNameInput: '//*[@id="session_email_address"]',
    passwordInput: '//*[@id="session_password"]',
    loginButton: '//*[@id="js_sessions_new_form"]/form/div[4]/button'
  }
};

// ASIN抽出のための正規表現
const AMAZON_ASIN_REGEX = /[A-Z0-9]{10}|[0-9-]{9,16}[0-9X]/;

/**
 * Bookメーターのスクレイパー実装
 */
export class BookmeterScraper implements BookScraperService {
  private readonly logger: Logger;
  private readonly credentials: {
    username: string;
    password: string;
  };
  private readonly kinokuniyaScraper: KinokuniyaScraper;

  /**
   * コンストラクタ
   * @param logger ロガー
   * @param credentials Bookmeterのログイン認証情報
   */
  constructor(
    logger: Logger,
    credentials: {
      username: string;
      password: string;
    }
  ) {
    this.logger = logger;
    this.credentials = credentials;
    this.kinokuniyaScraper = new KinokuniyaScraper(logger);
  }

  /**
   * Puppeteerブラウザを初期化
   */
  private async initializeBrowser(): Promise<Browser> {
    const browser = await puppeteer.launch({
      defaultViewport: { width: 1000, height: 1000 },
      headless: true,
      args: CHROME_ARGS,
      slowMo: 15
    });

    return browser;
  }

  /**
   * 画像読み込みを無効化する
   */
  private async setupImageBlocker(page: Page): Promise<void> {
    await page.setRequestInterception(true);

    page.on("request", (interceptedRequest) => {
      if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg")) {
        void interceptedRequest.abort();
      } else {
        void interceptedRequest.continue();
      }
    });
  }

  /**
   * AmazonリンクからASIN（またはISBN）を抽出
   */
  private extractAsinFromAmazonUrl(url: string): string | null {
    const matched = url.match(AMAZON_ASIN_REGEX);
    return matched?.[0] ?? null;
  }

  /**
   * Bookmeterにログインする
   */
  private async login(browser: Browser): Promise<Result<ScrapingError, void>> {
    this.logger.info("Bookmeterにログインします...");

    const page = await browser.newPage();

    try {
      // 画像読み込みを無効化して高速化
      await this.setupImageBlocker(page);

      // ログインページにアクセス
      await page.goto(`${BOOKMETER_BASE_URI}/login`, {
        waitUntil: "domcontentloaded"
      });

      // ログインフォームの要素を取得
      const accountNameInputHandles = await $x(page, XPATH.login.accountNameInput);
      const passwordInputHandles = await $x(page, XPATH.login.passwordInput);
      const loginButtonHandles = await $x(page, XPATH.login.loginButton);

      if (
        accountNameInputHandles.length === 0 ||
        passwordInputHandles.length === 0 ||
        loginButtonHandles.length === 0
      ) {
        return err(
          new ScrapingError(
            "ログインフォームの要素が見つかりませんでした",
            `${BOOKMETER_BASE_URI}/login`,
            "ログインフォーム"
          )
        );
      }

      // 認証情報を入力
      await accountNameInputHandles[0].type(this.credentials.username);
      await passwordInputHandles[0].type(this.credentials.password);

      // ログインボタンをクリックしてログイン
      await Promise.all([
        page.waitForNavigation({
          timeout: 2 * 60 * 1000,
          waitUntil: "domcontentloaded"
        }),
        loginButtonHandles[0].click()
      ]);

      this.logger.info("ログインに成功しました");
      return ok(undefined);
    } catch (error) {
      const scrapingError = new ScrapingError(
        `ログイン処理中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        `${BOOKMETER_BASE_URI}/login`,
        error
      );

      this.logger.error(scrapingError.message, { error });
      return err(scrapingError);
    } finally {
      await page.close();
    }
  }

  /**
   * 書籍の詳細情報を取得
   */
  private async parseBookDetails(
    page: Page,
    url: string
  ): Promise<
    Result<
      ScrapingError,
      {
        title: string;
        author: string;
        identifier: BookIdentifier;
      }
    >
  > {
    try {
      // Amazonリンク、著者、タイトルの要素を取得
      const amazonLinkHandles = await $x(page, XPATH.book.amazonLink);
      const authorHandles = await $x(page, XPATH.book.author);
      const titleHandles = await $x(page, XPATH.book.title);

      if (amazonLinkHandles.length === 0 || authorHandles.length === 0 || titleHandles.length === 0) {
        return err(new ScrapingError("書籍詳細の要素が見つかりませんでした", url, "書籍詳細"));
      }

      // 各要素からテキストを取得
      const amazonUrl = await getNodeProperty<string>(amazonLinkHandles[0], "href");
      const author = await getNodeProperty<string>(authorHandles[0], "textContent");
      const title = await getNodeProperty<string>(titleHandles[0], "textContent");

      if (amazonUrl.isError() || author.isError() || title.isError()) {
        return err(new ScrapingError("書籍詳細の要素からテキストを取得できませんでした", url));
      }

      // AmazonのURLからISBN/ASINを抽出
      const asinRaw = this.extractAsinFromAmazonUrl(amazonUrl.unwrap());

      if (!asinRaw) {
        return err(new ScrapingError("AmazonのURLからISBN/ASINを抽出できませんでした", url));
      }

      // 識別子をISBN10かASINとして扱う
      let identifier: BookIdentifier;

      if (isIsbn10(asinRaw)) {
        identifier = createISBN10(asinRaw);
      } else if (isAsin(asinRaw)) {
        identifier = createASIN(asinRaw);
      } else {
        // どちらでもない場合は不明なIDとして扱う
        identifier = createBookId(asinRaw) as unknown as BookIdentifier;
      }

      return ok({
        title: title.unwrap(),
        author: author.unwrap(),
        identifier
      });
    } catch (error) {
      const scrapingError = new ScrapingError(
        `書籍詳細の解析中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        url,
        error
      );

      this.logger.error(scrapingError.message, { error, url });
      return err(scrapingError);
    }
  }

  /**
   * 書籍をスキャンして詳細情報を取得
   */
  async scanBookWithLogin(
    bookUrl: string,
    options?: {
      register?: {
        mode: "wish" | "stacked";
      };
    }
  ): Promise<Result<ScrapingError, Book>> {
    const browser = await this.initializeBrowser();

    try {
      // ログイン
      const loginResult = await this.login(browser);

      if (loginResult.isError()) {
        return err(loginResult.unwrapError());
      }

      const page = await browser.newPage();

      try {
        // 画像読み込みを無効化して高速化
        await this.setupImageBlocker(page);

        // 書籍ページにアクセス
        await Promise.all([
          waitForXPath(page, XPATH.book.amazonLink, {
            timeout: 2 * 60 * 1000
          }),
          page.goto(bookUrl, { waitUntil: "domcontentloaded" })
        ]);

        // 書籍詳細を解析
        const detailsResult = await this.parseBookDetails(page, bookUrl);

        if (detailsResult.isError()) {
          return err(detailsResult.unwrapError());
        }

        const details = detailsResult.unwrap();

        // オプションで登録モードが指定されていれば、「読みたい本」または「積読本」として登録
        if (options?.register) {
          try {
            if (options.register.mode === "wish") {
              const wishButtonHandles = await $x(page, XPATH.book.registerWishBook);
              if (wishButtonHandles.length > 0) {
                await wishButtonHandles[0].click();
                this.logger.debug(`「読みたい本」に登録しました: ${bookUrl}`);
              }
            } else if (options.register.mode === "stacked") {
              const stackedButtonHandles = await $x(page, XPATH.book.registerStackedBook);
              if (stackedButtonHandles.length > 0) {
                await stackedButtonHandles[0].click();
                this.logger.debug(`「積読本」に登録しました: ${bookUrl}`);
              }
            }
          } catch (error) {
            this.logger.warn(`書籍の登録に失敗しました: ${bookUrl}`, { error });
            // 登録失敗はクリティカルではないので処理を続行
          }
        }

        // Book オブジェクトを作成
        const id = createBookId(bookUrl);

        // 書籍データの作成
        const book = createBook({
          id,
          url: bookUrl,
          identifier: details.identifier,
          title: details.title,
          author: details.author,
          publisher: "",
          publishedDate: "",
          description: "",
          libraryInfo: {
            existsIn: new Map<LibraryTag, boolean>([
              ["Sophia", false],
              ["UTokyo", false]
            ]),
            opacLinks: new Map<LibraryTag, string>(),
            mathLibOpacLink: ""
          }
        });

        return ok(book);
      } finally {
        await page.close();
      }
    } catch (error) {
      const scrapingError = new ScrapingError(
        `書籍のスキャン中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        bookUrl,
        error
      );

      this.logger.error(scrapingError.message, { error, bookUrl });
      return err(scrapingError);
    } finally {
      await browser.close();
    }
  }

  /**
   * 「読みたい本」リストを取得する
   * @param userId ユーザーID
   * @param isSignedIn ログイン状態の指定（デフォルトはログイン状態）
   * @param signal キャンセル用のAbortSignal
   */
  async getWishBooks(userId: string, isSignedIn: boolean = true, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>> {
    // キャンセルチェック
    if (signal?.aborted) {
      return err(
        new ScrapingError("処理がキャンセルされました", `${BOOKMETER_BASE_URI}/users/${userId}/books/wish`)
      );
    }

    let bookList: BookList = new Map();
    const browser = await this.initializeBrowser();

    try {
      // ログインが必要な場合のみログイン処理を実行
      if (isSignedIn) {
        const loginResult = await this.login(browser);
        if (loginResult.isError()) {
          return err(loginResult.unwrapError());
        }
      }

      const page = await browser.newPage();

      try {
        // 画像読み込みを無効化して高速化
        await this.setupImageBlocker(page);

        let pageNum = 1;
        
        // 未ログイン時のレート制限管理用変数
        let scanCounter = 0;
        let waitSeconds = 1.5;

        // ページネーションを処理しながらすべての書籍を取得
        while (true) {
          // キャンセルチェック
          if (signal?.aborted) {
            return err(
              new ScrapingError(
                "処理がキャンセルされました",
                `${BOOKMETER_BASE_URI}/users/${userId}/books/wish?page=${pageNum}`
              )
            );
          }

          // --- Step 1: 書籍リストページにアクセス ---
          const listPageUrl = `${BOOKMETER_BASE_URI}/users/${userId}/books/wish?page=${pageNum}`;
          this.logger.info(`「読みたい本」リストページにアクセスします: ${listPageUrl}`);

          try {
            await page.goto(listPageUrl, {
              waitUntil: "domcontentloaded",
              timeout: 30000 // 30秒のタイムアウト
            });
          } catch (error) {
            if (error instanceof Error && error.name === "TimeoutError") {
              this.logger.warn(`ページ ${pageNum} の読み込みでタイムアウトが発生しました。最後のページとみなします。`);
              break;
            }
            throw error; // その他のエラーは上位で処理
          }

          // デバッグ: 現在のURLをログに出力
          const currentUrl = page.url();
          this.logger.info(`現在のページURL: ${currentUrl}`);

          // --- Step 2: 書籍URLとAmazonリンク（ログイン時のみ）を抽出 ---
          const pageBookData: { bookUrl: string; amazonUrl?: string }[] = [];
          
          // ログイン状態に応じたXPathを選択
          const booksUrlXPath = isSignedIn ? XPATH.wish.login.booksUrl : XPATH.wish.guest.booksUrl;
          const amazonLinkXPath = XPATH.wish.login.amazonLink;

          this.logger.info(`使用するXPath (書籍URL): ${booksUrlXPath}`);
          const booksUrlHandles = await $x(page, booksUrlXPath);
          this.logger.info(`書籍URL要素数: ${booksUrlHandles.length}`);

          // 書籍が見つからなければページネーション終了
          if (booksUrlHandles.length === 0) {
            this.logger.info(`要素が見つかりませんでした。ページネーション終了と判断します。`);
            break;
          }

          // Amazonリンクはログイン状態の場合のみ取得
          const amazonLinkHandles = isSignedIn ? await $x(page, amazonLinkXPath) : [];
          if (isSignedIn) {
            this.logger.info(`使用するXPath (Amazonリンク): ${amazonLinkXPath}`);
            this.logger.info(`Amazonリンク要素数: ${amazonLinkHandles.length}`);
          }

          this.logger.debug(`「読みたい本」ページ ${pageNum} のデータを抽出中`);

          // 要素ハンドルからURLを抽出して配列に格納
          for (let i = 0; i < booksUrlHandles.length; i++) {
            try {
              const bookUrl = (await getNodeProperty<string>(booksUrlHandles[i], "href")).unwrap();
              if (!bookUrl) {
                this.logger.warn(`書籍URLが取得できませんでした (要素 ${i})。スキップします。`);
                continue;
              }
              
              let amazonUrl: string | undefined;
              // Amazonリンクはログイン状態の場合のみ取得を試みる
              if (isSignedIn && amazonLinkHandles.length > i) {
                amazonUrl = (await getNodeProperty<string>(amazonLinkHandles[i], "href")).unwrap();
              }
              
              // ログイン状態の場合のみAmazonリンクのチェック
              if (isSignedIn && !amazonUrl) {
                this.logger.warn(`Amazonリンクが取得できませんでした (要素 ${i})。スキップします。`);
                continue;
              }
              
              pageBookData.push({ bookUrl, amazonUrl });
            } catch (error) {
              this.logger.warn(`リストページからのURL抽出中にエラーが発生しました (要素 ${i})。スキップします。`, {
                error
              });
            }
          }

          // --- Step 3: 抽出したデータを処理 ---
          this.logger.debug(`抽出した ${pageBookData.length} 件の書籍データを処理中`);

          for (const bookData of pageBookData) {
            const { bookUrl, amazonUrl } = bookData;

            // キャンセルチェック
            if (signal?.aborted) {
              return err(
                new ScrapingError(
                  "処理がキャンセルされました",
                  listPageUrl
                )
              );
            }

            // 変数初期化
            let identifier: BookIdentifier | undefined;
            let title = "";
            let author = "";
            let fetchDetails = false; // 詳細ページを取得する必要があるかどうかのフラグ

            // ログイン状態ではAmazonリンクから識別子取得を試みる
            if (isSignedIn && amazonUrl) {
              const asinRaw = this.extractAsinFromAmazonUrl(amazonUrl);

              if (asinRaw) {
                if (isIsbn10(asinRaw)) {
                  identifier = createISBN10(asinRaw);
                } else if (isAsin(asinRaw)) {
                  identifier = createASIN(asinRaw);
                } else {
                  this.logger.debug(`リストページから有効な識別子を抽出できませんでした (無効な形式): ${bookUrl}`);
                  fetchDetails = true;
                }
              } else {
                this.logger.debug(`リストページのAmazonリンクから識別子を抽出できませんでした (抽出失敗): ${bookUrl}`);
                fetchDetails = true;
              }
            } else {
              // 未ログイン状態では詳細ページを取得
              fetchDetails = true;
            }

            // 詳細ページを取得する必要がある場合
            if (fetchDetails) {
              this.logger.debug(`書籍詳細ページをスキャンします: ${bookUrl}`);
              try {
                // 書籍詳細ページに遷移
                await Promise.all([
                  waitForXPath(page, XPATH.book.amazonLink, { timeout: 30 * 1000 }).catch(() => {
                    this.logger.debug(`waitForXPath(amazonLink) タイムアウト (無視): ${bookUrl}`);
                  }),
                  page.goto(bookUrl, { waitUntil: "domcontentloaded", timeout: 120 * 1000 })
                ]);

                // 書籍詳細を解析
                const detailsResult = await this.parseBookDetails(page, bookUrl);

                if (detailsResult.isError()) {
                  this.logger.warn(`書籍詳細の解析に失敗しました: ${bookUrl}`, {
                    error: detailsResult.unwrapError()
                  });
                  continue;
                }

                // 解析成功時：識別子、タイトル、著者を取得
                const details = detailsResult.unwrap();
                identifier = details.identifier;
                title = details.title;
                author = details.author;
                
                // 未ログイン状態の場合はレート制限対策
                if (!isSignedIn) {
                  scanCounter++;
                  
                  // 元の実装のレート制限ロジックを再現
                  if (scanCounter % 10 === 0) {
                    if (waitSeconds < 5.5) {
                      waitSeconds += 0.2;
                      this.logger.debug(`待機時間を増加: ${waitSeconds}秒`);
                    }
                  }
                  
                  // 待機
                  this.logger.debug(`レート制限対策: ${waitSeconds}秒待機`);
                  await sleep(waitSeconds * 1000);
                }
              } catch (error) {
                this.logger.warn(`書籍詳細ページのスキャン中にエラーが発生しました: ${bookUrl}`, { error });
                await sleep(500);
                continue;
              }
            }

            // 識別子が取得できなかった場合はスキップ
            if (!identifier) {
              this.logger.warn(`書籍の識別子を取得できませんでした。スキップします: ${bookUrl}`);
              continue;
            }

            // Book オブジェクトを作成
            const id = createBookId(bookUrl);
            const book = createBook({
              id,
              url: bookUrl,
              identifier,
              title,
              author,
              publisher: "",
              publishedDate: "",
              description: "",
              libraryInfo: {
                existsIn: new Map<LibraryTag, boolean>([
                  ["Sophia", false],
                  ["UTokyo", false]
                ]),
                opacLinks: new Map<LibraryTag, string>(),
                mathLibOpacLink: ""
              }
            });

            // BookList に書籍を追加
            bookList = addBook(bookList, book);

            // アクセス間隔を設ける
            await sleep(500);
          }

          // 次のページへ
          pageNum++;
          
          // 未ログイン状態の場合は、元の実装に合わせて40秒待機
          if (!isSignedIn) {
            this.logger.info("ページ間の待機: 40秒");
            await sleep(40 * 1000);
          }
        }

        this.logger.info(`「読みたい本」リストの取得が完了しました (${bookList.size}冊)`);
        return ok(bookList);
      } finally {
        await page.close();
      }
    } catch (error) {
      const scrapingError = new ScrapingError(
        `「読みたい本」リストの取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        `${BOOKMETER_BASE_URI}/users/${userId}/books/wish`,
        error
      );

      this.logger.error(scrapingError.message, { error, userId });
      return err(scrapingError);
    } finally {
      await browser.close();
    }
  }

  /**
   * 「積読本」リストを取得する
   * @param userId ユーザーID
   * @param signal キャンセル用のAbortSignal
   */
  async getStackedBooks(userId: string, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>> {
    // キャンセルチェック
    if (signal?.aborted) {
      return err(
        new ScrapingError("処理がキャンセルされました", `${BOOKMETER_BASE_URI}/users/${userId}/books/stacked`)
      );
    }

    let bookList: BookList = new Map();
    const browser = await this.initializeBrowser();

    try {
      // 積読本リストの取得にはログインが必要
      const loginResult = await this.login(browser);
      if (loginResult.isError()) {
        return err(loginResult.unwrapError());
      }

      const page = await browser.newPage();

      try {
        // 画像読み込みを無効化して高速化
        await this.setupImageBlocker(page);

        let pageNum = 1;
        
        // レート制限管理変数
        let scanCounter = 0;
        let waitSeconds = 1.5;

        // ページネーションを処理しながらすべての書籍を取得
        while (true) {
          // キャンセルチェック
          if (signal?.aborted) {
            return err(
              new ScrapingError(
                "処理がキャンセルされました",
                `${BOOKMETER_BASE_URI}/users/${userId}/books/stacked?page=${pageNum}`
              )
            );
          }

          // --- Step 1: 書籍リストページにアクセス ---
          const listPageUrl = `${BOOKMETER_BASE_URI}/users/${userId}/books/stacked?page=${pageNum}`;
          this.logger.info(`「積読本」リストページにアクセスします: ${listPageUrl}`);

          try {
            await page.goto(listPageUrl, {
              waitUntil: "domcontentloaded",
              timeout: 30000
            });
          } catch (error) {
            if (error instanceof Error && error.name === "TimeoutError") {
              this.logger.warn(`ページ ${pageNum} の読み込みでタイムアウトが発生しました。最後のページとみなします。`);
              break;
            }
            throw error;
          }

          // --- Step 2: 書籍URLを抽出 ---
          this.logger.info(`使用するXPath (書籍URL): ${XPATH.stacked.booksUrl}`);
          const booksUrlHandles = await $x(page, XPATH.stacked.booksUrl);
          this.logger.info(`書籍URL要素数: ${booksUrlHandles.length}`);

          // 書籍が見つからなければページネーション終了
          if (booksUrlHandles.length === 0) {
            this.logger.info(`要素が見つかりませんでした。ページネーション終了と判断します。`);
            break;
          }

          this.logger.debug(`「積読本」ページ ${pageNum} のデータを抽出中`);

          // 書籍URLを抽出
          const bookUrls: string[] = [];
          for (const handle of booksUrlHandles) {
            try {
              const bookUrl = (await getNodeProperty<string>(handle, "href")).unwrap();
              if (bookUrl) {
                bookUrls.push(bookUrl);
              } else {
                this.logger.warn(`書籍URLが取得できませんでした。スキップします。`);
              }
            } catch (error) {
              this.logger.warn(`リストページからのURL抽出中にエラーが発生しました。スキップします。`, { error });
            }
          }

          // --- Step 3: 各書籍の詳細ページを処理 ---
          for (const bookUrl of bookUrls) {
            // キャンセルチェック
            if (signal?.aborted) {
              return err(
                new ScrapingError("処理がキャンセルされました", listPageUrl)
              );
            }

            this.logger.debug(`書籍詳細ページをスキャンします: ${bookUrl}`);
            
            try {
              // 書籍詳細ページに遷移
              await Promise.all([
                waitForXPath(page, XPATH.book.amazonLink, { timeout: 30 * 1000 }).catch(() => {
                  this.logger.debug(`waitForXPath(amazonLink) タイムアウト (無視): ${bookUrl}`);
                }),
                page.goto(bookUrl, { waitUntil: "domcontentloaded", timeout: 120 * 1000 })
              ]);

              // 書籍詳細を解析
              const detailsResult = await this.parseBookDetails(page, bookUrl);

              if (detailsResult.isError()) {
                this.logger.warn(`書籍詳細の解析に失敗しました: ${bookUrl}`, {
                  error: detailsResult.unwrapError()
                });
                continue;
              }

              // 解析成功時：識別子、タイトル、著者を取得
              const details = detailsResult.unwrap();
              const identifier = details.identifier;
              const title = details.title;
              const author = details.author;

              // Book オブジェクトを作成
              const id = createBookId(bookUrl);
              const book = createBook({
                id,
                url: bookUrl,
                identifier,
                title,
                author,
                publisher: "",
                publishedDate: "",
                description: "",
                libraryInfo: {
                  existsIn: new Map<LibraryTag, boolean>([
                    ["Sophia", false],
                    ["UTokyo", false]
                  ]),
                  opacLinks: new Map<LibraryTag, string>(),
                  mathLibOpacLink: ""
                }
              });

              // BookList に書籍を追加
              bookList = addBook(bookList, book);

              // レート制限対策
              scanCounter++;
              if (scanCounter % 10 === 0) {
                if (waitSeconds < 5.5) {
                  waitSeconds += 0.2;
                  this.logger.debug(`待機時間を増加: ${waitSeconds}秒`);
                }
              }
              
              // 待機
              await sleep(waitSeconds * 1000);
              
            } catch (error) {
              this.logger.warn(`書籍詳細ページのスキャン中にエラーが発生しました: ${bookUrl}`, { error });
              await sleep(500);
              continue;
            }
          }

          // 次のページへ
          pageNum++;
          
          // 元の実装に合わせて40秒待機
          this.logger.info("ページ間の待機: 40秒");
          await sleep(40 * 1000);
        }

        this.logger.info(`「積読本」リストの取得が完了しました (${bookList.size}冊)`);
        return ok(bookList);
      } finally {
        await page.close();
      }
    } catch (error) {
      const scrapingError = new ScrapingError(
        `「積読本」リストの取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        `${BOOKMETER_BASE_URI}/users/${userId}/books/stacked`,
        error
      );

      this.logger.error(scrapingError.message, { error, userId });
      return err(scrapingError);
    } finally {
      await browser.close();
    }
  }

  // getBooks メソッドは getWishBooks と getStackedBooks に分離されたため削除
}
