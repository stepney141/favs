import { BookListImpl } from "../../../domain/models/book";
import { success, failure } from "../../../domain/models/valueObjects";
import { IsbnService } from "../../../domain/services/isbnService";

import type { BookScraperService, BrowserSession } from "../../../application/ports/output/bookScraperService";
import type { BookList, Book, LibraryAvailability } from "../../../domain/models/book";
import type { Result, UserId, BookId, ISBN10, ISBN13, ASIN, LibraryId } from "../../../domain/models/valueObjects";
// ElementHandleは未使用のため削除

/**
 * ブクメータースクレイパーの設定
 */
interface BookmeterScraperConfig {
  /**
   * ブクメーターのベースURL
   */
  baseUrl: string;
  
  /**
   * ログインURL
   */
  loginUrl: string;
  
  /**
   * 読みたい本一覧のURL（ユーザーIDをプレースホルダに）
   */
  wishListUrlTemplate: string;
  
  /**
   * 積読本一覧のURL（ユーザーIDをプレースホルダに）
   */
  stackedListUrlTemplate: string;
  
  /**
   * XPathやセレクタの設定
   */
  selectors: {
    /**
     * ログイン関連
     */
    login: {
      emailInput: string;
      passwordInput: string;
      submitButton: string;
    };
    
    /**
     * 読みたい本一覧
     */
    wishList: {
      bookItems: string;
      bookUrl: string;
      amazonLink: string;
      isMoreBooks: string;
    };
    
    /**
     * 積読本一覧
     */
    stackedList: {
      bookItems: string;
      bookUrl: string;
      amazonLink: string;
      isMoreBooks: string;
    };
    
    /**
     * 書籍詳細ページ
     */
    bookDetail: {
      title: string;
      author: string;
      amazonLink: string;
    };
  };
}

/**
 * ブクメータースクレイパー実装
 */
export class BookmeterScraper implements BookScraperService {
  private readonly browserSession: BrowserSession;
  private readonly config: BookmeterScraperConfig;
  
  /**
   * ログイン状態かどうか
   */
  isLoggedIn = false;
  
  /**
   * コンストラクタ
   * @param browserSession ブラウザセッション
   * @param config スクレイパー設定
   */
  constructor(
    browserSession: BrowserSession,
    config: Partial<BookmeterScraperConfig> = {}
  ) {
    this.browserSession = browserSession;
    
    // デフォルト設定とマージ
    this.config = {
      baseUrl: "https://bookmeter.com",
      loginUrl: "https://bookmeter.com/login",
      wishListUrlTemplate: "https://bookmeter.com/users/{userId}/books/wish?page={page}",
      stackedListUrlTemplate: "https://bookmeter.com/users/{userId}/books?display_type=stack&page={page}",
      selectors: {
        login: {
          emailInput: "#session_email_address",
          passwordInput: "#session_password",
          submitButton: "#js_sessions_new_form form button[type='submit']"
        },
        wishList: {
          bookItems: "ul.books.wish li.book",
          bookUrl: "div.detail__title a",
          amazonLink: "div.group__action a[href*='amazon.co.jp']",
          isMoreBooks: ".books.wish li.book"
        },
        stackedList: {
          bookItems: "ul.books.stack li.book",
          bookUrl: "div.detail__title a",
          amazonLink: "div.group__action a[href*='amazon.co.jp']",
          isMoreBooks: ".books.stack li.book"
        },
        bookDetail: {
          title: "header div.header__title",
          author: "header div.header__authors a",
          amazonLink: "a[href*='amazon.co.jp']"
        }
      },
      ...config
    };
  }
  
  /**
   * スクレイパーの初期化
   * @returns 初期化結果
   */
  async initialize(): Promise<Result<void>> {
    try {
      const result = await this.browserSession.initialize();
      return result;
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("ブクメータースクレイパーの初期化に失敗しました"));
    }
  }
  
  /**
   * ブクメーターにログインする
   * @param username ユーザー名
   * @param password パスワード
   * @returns ログイン結果
   */
  async login(username: string, password: string): Promise<Result<void>> {
    try {
      // ログインページに移動
      const navigateResult = await this.browserSession.navigateTo(this.config.loginUrl);
      if (navigateResult.type === "failure") return navigateResult;
      
      // ユーザー名を入力
      const emailInputResult = await this.browserSession.type(
        this.config.selectors.login.emailInput,
        username
      );
      if (emailInputResult.type === "failure") return emailInputResult;
      
      // パスワードを入力
      const passwordInputResult = await this.browserSession.type(
        this.config.selectors.login.passwordInput,
        password
      );
      if (passwordInputResult.type === "failure") return passwordInputResult;
      
      // ログインボタンをクリック
      const clickResult = await this.browserSession.click(
        this.config.selectors.login.submitButton
      );
      if (clickResult.type === "failure") return clickResult;
      
      // ログイン後のページ遷移を待機
      // インターフェースにwaitForメソッドがないため、別の方法で待機
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // ログイン成功を記録
      this.isLoggedIn = true;
      
      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("ブクメーターへのログインに失敗しました"));
    }
  }
  
  /**
   * 読みたい本リストを取得する
   * @param userId ユーザーID
   * @returns 取得結果
   */
  async getWishBooks(userId: UserId): Promise<Result<BookList>> {
    try {
      // 書籍リストを取得
      const books = await this.scrapeBookList(
        "wish", 
        userId.toString(),
        this.config.selectors.wishList
      );
      
      // BookListオブジェクトを作成
      const bookList = this.createBookList(books, "wish");
      return success(bookList);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("読みたい本リストの取得に失敗しました"));
    }
  }
  
  /**
   * 積読本リストを取得する
   * @param userId ユーザーID
   * @returns 取得結果
   */
  async getStackedBooks(userId: UserId): Promise<Result<BookList>> {
    try {
      // 書籍リストを取得
      const books = await this.scrapeBookList(
        "stacked", 
        userId.toString(),
        this.config.selectors.stackedList
      );
      
      // BookListオブジェクトを作成
      const bookList = this.createBookList(books, "stacked");
      return success(bookList);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("積読本リストの取得に失敗しました"));
    }
  }
  
  /**
   * スクレイパーのリソースを解放する
   * @returns 解放結果
   */
  async dispose(): Promise<Result<void>> {
    try {
      return await this.browserSession.close();
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("ブクメータースクレイパーの解放に失敗しました"));
    }
  }
  
  /**
   * 書籍リストをスクレイピングする
   * @param type リストの種類
   * @param userId ユーザーID
   * @param selectors セレクタ設定
   * @returns 書籍の配列
   * @private
   */
  private async scrapeBookList(
    type: "wish" | "stacked",
    userId: string,
    selectors: {
      bookItems: string;
      bookUrl: string;
      amazonLink: string;
      isMoreBooks: string;
    }
  ): Promise<Book[]> {
    const books: Book[] = [];
    let pageNum = 1;
    let hasNextPage = true;

    // テンプレートURLの生成
    const urlTemplate = type === "wish" 
      ? this.config.wishListUrlTemplate 
      : this.config.stackedListUrlTemplate;
    
    while (hasNextPage) {
      // ページURLの生成
      const pageUrl = urlTemplate
        .replace("{userId}", userId)
        .replace("{page}", pageNum.toString());
      
      // ページに移動
      const navigateResult = await this.browserSession.navigateTo(pageUrl);
      if (navigateResult.type === "failure") {
        throw new Error(`ページ${pageNum}への移動に失敗しました: ${String(navigateResult.error)}`);
      }
      
      // 書籍要素の取得
      const hasBooks = await this.browserSession.evaluate(
        `(selector) => document.querySelectorAll(selector).length > 0`
      );
      
      if (hasBooks.type === "failure" || !hasBooks.value) {
        // 要素がない場合は終了
        hasNextPage = false;
        break;
      }
      
      // このページの全ての書籍URLとアマゾンリンクを取得
      // 手動で各書籍URLを抽出する
      const bookUrlsArray: string[] = [];
      
      // セレクタで個別に各書籍のURLを取得
      for (let i = 0; i < 30; i++) { // 最大30冊を想定
        const selector = `${selectors.bookItems}:nth-child(${i+1}) ${selectors.bookUrl}`;
        const urlResult = await this.browserSession.getAttribute(selector, "href");
        if (urlResult.type === "success" && urlResult.value) {
          bookUrlsArray.push(urlResult.value);
        }
      }
      
      // 各書籍の詳細情報を取得
      for (const bookUrl of bookUrlsArray) {
        if (bookUrl) {
          const fullBookUrl = this.config.baseUrl + bookUrl;
          const book = await this.scrapeBookDetail(fullBookUrl);
          books.push(book);
        }
      }
      
      console.log(`${type} ページ ${pageNum} をスクレイピングしました（${books.length}冊）`);
      
      // 次のページへ
      pageNum++;
      
      // 取得間隔を空ける
      // インターフェースにwaitForメソッドがないため、別の方法で待機
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return books;
  }
  
  /**
   * 書籍詳細情報を取得する
   * @param detailUrl 詳細ページのURL
   * @returns 書籍情報
   * @private
   */
  private async scrapeBookDetail(detailUrl: string): Promise<Book> {
    // 詳細ページに移動
    const navigateResult = await this.browserSession.navigateTo(detailUrl);
    if (navigateResult.type === "failure") {
      throw new Error(`詳細ページへの移動に失敗しました: ${String(navigateResult.error)}`);
    }
    
    // タイトルを取得
    const titleResult = await this.browserSession.getText(this.config.selectors.bookDetail.title);
    const title = titleResult.type === "success" ? titleResult.value : "取得失敗";
    
    // 著者を取得
    const authorResult = await this.browserSession.getText(this.config.selectors.bookDetail.author);
    const author = authorResult.type === "success" ? authorResult.value : "取得失敗";
    
    // AmazonリンクからISBNを抽出
    const amazonLinkResult = await this.browserSession.getAttribute(
      this.config.selectors.bookDetail.amazonLink,
      "href"
    );
    
    let isbn: ISBN10 | ISBN13 | ASIN = "0000000000" as ASIN;
    let isbnExtractResult: Result<ISBN10 | ASIN>;
    
    if (amazonLinkResult.type === "success" && amazonLinkResult.value) {
      isbnExtractResult = this.extractIsbnFromAmazonUrl(amazonLinkResult.value);
      if (isbnExtractResult.type === "success") {
        isbn = isbnExtractResult.value;
      }
    }
    
    // 書籍オブジェクトを作成
    const bookId = `book-${Date.now()}-${Math.random().toString(36).substring(2, 10)}` as BookId;
    
    const book: Book = {
      id: bookId,
      isbn: isbn,
      title: title,
      author: author,
      publisher: "",
      publishedDate: "",
      bookmeterUrl: detailUrl,
      libraryAvailability: new Map<LibraryId, LibraryAvailability>()
    };
    
    return book;
  }
  
  /**
   * AmazonリンクからISBNを抽出する
   * @param amazonUrl AmazonのURL
   * @returns ISBN
   * @private
   */
  private extractIsbnFromAmazonUrl(amazonUrl: string): Result<ISBN10 | ASIN> {
    try {
      // ASINまたはISBNを抽出するための正規表現
      const asinMatch = amazonUrl.match(/\/dp\/([A-Z0-9]{10})(?:\/|\?|$)/);
      const isbnMatch = amazonUrl.match(/\/gp\/product\/([A-Z0-9]{10})(?:\/|\?|$)/);
      
      const code = asinMatch?.[1] || isbnMatch?.[1];
      
      if (!code) {
        return failure(new Error("AmazonリンクからISBN/ASINを抽出できませんでした"));
      }
      
      // ISBNの場合は検証
      const isbnResult = IsbnService.parseISBN(code);
      
      if (isbnResult.type === "success") {
        // ISBN10またはISBN13が返ってくる可能性があるが、
        // このメソッドはISBN10またはASINを返す必要がある
        const parsedIsbn = isbnResult.value;
        // ISBN10の場合はそのまま返す
        if (parsedIsbn.toString().length === 10) {
          return success(parsedIsbn as ISBN10);
        }
        // ISBN13の場合はASINとして扱う
        return success(code as ASIN);
      }
      
      // ASIN（Amazon固有の商品コード）として扱う
      return success(code as ASIN);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error("ISBNの抽出処理に失敗しました"));
    }
  }
  
  /**
   * 書籍リストオブジェクトを作成する
   * @param books 書籍の配列
   * @param type リストの種類
   * @returns 書籍リスト
   * @private
   */
  private createBookList(books: Book[], type: "wish" | "stacked"): BookList {
    return BookListImpl.fromArray(books, type);
  }
}
