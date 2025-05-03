import puppeteer from "puppeteer";

import { getNodeProperty, $x, waitForXPath } from "../../../../.libs/pptr-utils";
import { sleep } from "../../../../.libs/utils";
import { createBook, addBook } from "../../../domain/models/book";
import { ScrapingError } from "../../../domain/models/errors";
import { ok, err } from "../../../domain/models/result";
import { createBookId, createISBN10, createASIN } from "../../../domain/models/valueObjects";
import { isAsin, isIsbn10, convertISBN10To13 } from "../../../domain/services/isbnService";

import type { BookScraperService } from "../../../application/ports/output/bookScraperService";
import type { Logger } from "../../../application/ports/output/logger";
import type { Book, BookList, BookListType } from "../../../domain/models/book";
import type { Result } from "../../../domain/models/result";
import type { BookIdentifier, ISBN10, LibraryTag } from "../../../domain/models/valueObjects";
import type { Browser, Page } from "puppeteer";

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
  },
  kinokuniya: {
    出版社内容情報: '//div[@class="career_box"]/h3[text()="出版社内容情報"]/following-sibling::p[1]',
    内容説明: '//div[@class="career_box"]/h3[text()="内容説明"]/following-sibling::p[1]',
    目次: '//div[@class="career_box"]/h3[text()="目次"]/following-sibling::p[1]'
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
        "ログイン処理",
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
      const amazonUrl = await getNodeProperty(amazonLinkHandles[0], "href");
      const author = String(await getNodeProperty(authorHandles[0], "textContent"));
      const title = String(await getNodeProperty(titleHandles[0], "textContent"));

      // AmazonのURLからISBN/ASINを抽出
      const asinRaw = this.extractAsinFromAmazonUrl(String(amazonUrl));

      if (!asinRaw) {
        return err(
          new ScrapingError("AmazonのURLからISBN/ASINを抽出できませんでした", url, "ISBN/ASIN抽出", {
            amazonUrl: String(amazonUrl)
          })
        );
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
        title,
        author,
        identifier
      });
    } catch (error) {
      const scrapingError = new ScrapingError(
        `書籍詳細の解析中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        url,
        "書籍詳細解析",
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
        "書籍スキャン",
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
   */
  async getWishBooks(userId: string, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>> {
    return this.getBooks("wish", userId, signal);
  }

  /**
   * 「積読本」リストを取得する
   */
  async getStackedBooks(userId: string, signal?: AbortSignal): Promise<Result<ScrapingError, BookList>> {
    return this.getBooks("stacked", userId, signal);
  }

  /**
   * 書籍リストを取得する共通処理
   */
  private async getBooks(
    type: BookListType,
    userId: string,
    signal?: AbortSignal
  ): Promise<Result<ScrapingError, BookList>> {
    // キャンセルチェック
    if (signal?.aborted) {
      return err(
        new ScrapingError(
          "処理がキャンセルされました",
          `${BOOKMETER_BASE_URI}/users/${userId}/books/${type}`,
          "キャンセル"
        )
      );
    }

    let bookList: BookList = new Map();
    const browser = await this.initializeBrowser();

    try {
      // ログイン状態でスクレイピングするためにログイン処理を実行
      const loginResult = await this.login(browser);

      if (loginResult.isError()) {
        return err(loginResult.unwrapError());
      }

      const page = await browser.newPage();

      try {
        // 画像読み込みを無効化して高速化
        await this.setupImageBlocker(page);

        let pageNum = 1;

        // ページネーションを処理しながらすべての書籍を取得
        while (true) {
          // キャンセルチェック
          if (signal?.aborted) {
            return err(
              new ScrapingError(
                "処理がキャンセルされました",
                `${BOOKMETER_BASE_URI}/users/${userId}/books/${type}?page=${pageNum}`,
                "キャンセル"
              )
            );
          }

          // 一覧ページにアクセス
          await page.goto(`${BOOKMETER_BASE_URI}/users/${userId}/books/${type}?page=${pageNum}`, {
            waitUntil: "domcontentloaded"
          });

          // XPathパターンを使用して書籍URLとAmazonリンクの要素を取得
          const booksUrlXPath = type === "wish" ? XPATH.wish.login.booksUrl : XPATH.stacked.booksUrl;
          const amazonLinkXPath = XPATH.wish.login.amazonLink;

          const booksUrlHandles = await $x(page, booksUrlXPath);

          // 書籍が見つからなければページネーション終了
          if (booksUrlHandles.length === 0) {
            break;
          }

          this.logger.debug(`「${type === "wish" ? "読みたい本" : "積読本"}」ページ ${pageNum} をスキャンしています`);

          // Amazonリンクを取得（「読みたい本」の場合のみ）
          const amazonLinkHandles = type === "wish" ? await $x(page, amazonLinkXPath) : [];

          // 書籍URLから書籍情報を作成
          for (let i = 0; i < booksUrlHandles.length; i++) {
            // キャンセルチェック
            if (signal?.aborted) {
              return err(
                new ScrapingError(
                  "処理がキャンセルされました",
                  `${BOOKMETER_BASE_URI}/users/${userId}/books/${type}?page=${pageNum}`,
                  "書籍スキャン中"
                )
              );
            }

            const bookUrl = String(await getNodeProperty(booksUrlHandles[i], "href"));

            // ISBNまたはASINを抽出
            let identifier: BookIdentifier;

            if (type === "wish" && amazonLinkHandles.length > 0) {
              // 「読みたい本」の場合は一覧ページのAmazonリンクからISBN/ASINを取得
              const amazonUrl = await getNodeProperty(amazonLinkHandles[i], "href");
              const asinRaw = this.extractAsinFromAmazonUrl(String(amazonUrl));

              if (asinRaw) {
                if (isIsbn10(asinRaw)) {
                  identifier = createISBN10(asinRaw);
                } else if (isAsin(asinRaw)) {
                  identifier = createASIN(asinRaw);
                } else {
                  identifier = createBookId(asinRaw) as unknown as BookIdentifier;
                }
              } else {
                // 抽出失敗時は書籍URLをそのままIDとして使用
                identifier = createBookId(bookUrl) as unknown as BookIdentifier;
              }
            } else {
              // 「積読本」または読みたい本でAmazonリンクが取得できない場合は詳細ページを取得
              // リクエスト数を減らすため、後で非同期バッチ処理するのが望ましいが
              // 今回はシンプルに実装するため直列処理
              const scanResult = await this.scanBookWithLogin(bookUrl);

              if (scanResult.isError()) {
                this.logger.warn(`書籍のスキャンに失敗しました: ${bookUrl}`, {
                  error: scanResult.unwrapError()
                });
                continue;
              }

              const book = scanResult.unwrap();
              // BookList (ReadonlyMap) に対してaddBook関数を使用
              bookList = addBook(bookList, book);

              // 詳細ページのスクレイピングでは1書籍ごとに処理するため次のループへ
              continue;
            }

            // Book オブジェクトを作成
            const id = createBookId(bookUrl);

            // この時点ではタイトルと著者は不明（詳細ページをスクレイピングする必要がある）
            const book = createBook({
              id,
              url: bookUrl,
              identifier,
              title: "",
              author: "",
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

            // BookList (ReadonlyMap) に対してaddBook関数を使用
            bookList = addBook(bookList, book);
          }

          // 次のページへ
          pageNum++;
        }

        this.logger.info(
          `「${type === "wish" ? "読みたい本" : "積読本"}」リストの取得が完了しました (${bookList.size}冊)`
        );
        return ok(bookList);
      } finally {
        await page.close();
      }
    } catch (error) {
      const scrapingError = new ScrapingError(
        `「${type === "wish" ? "読みたい本" : "積読本"}」リストの取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        `${BOOKMETER_BASE_URI}/users/${userId}/books/${type}`,
        `${type}リスト取得`,
        error
      );

      this.logger.error(scrapingError.message, { error, type, userId });
      return err(scrapingError);
    } finally {
      await browser.close();
    }
  }

  /**
   * 紀伊國屋書店から書籍の説明を取得
   */
  async scrapeBookDescription(isbn: ISBN10): Promise<Result<ScrapingError, string>> {
    const browser = await this.initializeBrowser();

    try {
      const page = await browser.newPage();

      try {
        // ISBN10をISBN13に変換
        const isbn13 = convertISBN10To13(isbn);

        // 日本の書籍かどうかでURLを分岐
        const isJapaneseBook = isbn.toString().startsWith("4");
        const kinokuniyaUrl = isJapaneseBook
          ? `https://www.kinokuniya.co.jp/f/dsg-01-${isbn13}`
          : `https://www.kinokuniya.co.jp/f/dsg-02-${isbn13}`;

        this.logger.debug(`紀伊國屋書店から書籍説明を取得します: ${isbn} (${kinokuniyaUrl})`);

        // 紀伊國屋書店のページにアクセス
        await page.goto(kinokuniyaUrl, { waitUntil: "networkidle2" });

        // しばらく待機（DOMが完全に読み込まれるのを待つ）
        await sleep(1000);

        let description = "";

        // 「出版社内容情報」「内容説明」「目次」の3つの要素を取得して結合
        for (const xpath of [XPATH.kinokuniya.出版社内容情報, XPATH.kinokuniya.内容説明, XPATH.kinokuniya.目次]) {
          const elements = await $x(page, xpath);

          if (elements.length > 0) {
            try {
              const text = await page.evaluate((el) => el.textContent, elements[0]);

              if (text && text.trim()) {
                description += `${text.trim()}\n\n`;
              }
            } catch (error) {
              this.logger.warn(`要素のテキスト取得に失敗しました: ${xpath}`, { error });
              // エラーが発生しても処理を続行
            }
          }
        }

        // 説明が取得できなかった場合
        if (!description) {
          this.logger.debug(`書籍説明が見つかりませんでした: ${isbn} (${kinokuniyaUrl})`);
          return ok("");
        }

        this.logger.debug(`書籍説明を取得しました: ${isbn} (${description.length}文字)`);
        return ok(description.trim());
      } finally {
        await page.close();
      }
    } catch (error) {
      const scrapingError = new ScrapingError(
        `書籍説明の取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        `https://www.kinokuniya.co.jp/f/dsg-01-${isbn}`,
        "書籍説明取得",
        error
      );

      this.logger.error(scrapingError.message, { error, isbn });
      return err(scrapingError);
    } finally {
      await browser.close();
    }
  }
}
