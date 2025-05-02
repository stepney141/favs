import axios from 'axios';

import { success, failure } from '../../../domain/models/valueObjects';

import type { BiblioInfoProvider } from '../../../application/ports/output/biblioInfoProvider';
import type { Book } from '../../../domain/models/book';
import type { BiblioinfoErrorStatus, Result} from '../../../domain/models/valueObjects';

/**
 * OpenBD API レスポンスの型定義
 */
interface OpenBdResponse {
  summary?: {
    isbn: string;
    title: string;
    volume: string;
    series: string;
    publisher: string;
    pubdate: string;
    cover: string;
    author: string;
  };
  onix?: {
    CollateralDetail?: {
      TextContent?: Array<{
        TextType: string;
        ContentAudience: string;
        Text: string;
      }>;
    };
  };
}

/**
 * OpenBD APIクライアント
 * 国内書籍の書誌情報を取得する
 */
export class OpenBdApiClient implements BiblioInfoProvider {
  readonly name = 'OpenBD';
  private readonly baseUrl: string;
  
  /**
   * コンストラクタ
   * @param baseUrl APIのベースURL
   */
  constructor(baseUrl: string = 'https://api.openbd.jp/v1') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * 指定したISBNの書籍の詳細情報を取得する
   * @param isbn ISBN
   * @returns 取得結果
   */
  async fetchInfoByIsbn(isbn: string): Promise<Result<Partial<Book>, BiblioinfoErrorStatus>> {
    // 実装すべき処理:
    // 1. ISBNの形式を検証
    // 2. OpenBD APIにリクエストを送信
    // 3. レスポンスを解析して書籍情報を抽出
    // 4. 書籍情報を返す
    
    try {
      const url = `${this.baseUrl}/get?isbn=${isbn}`;
      
      const response = await axios.get<[OpenBdResponse | null]>(url);
      const data = response.data[0];
      
      if (!data) {
        return failure('Not_found_in_OpenBD');
      }
      
      // 書籍情報を取得
      let title = '';
      let author = '';
      let publisher = '';
      let publishedDate = '';
      let description = '';
      let tableOfContents = '';
      
      // 書籍の基本情報を設定
      if (data.summary) {
        title = data.summary.title;
        author = data.summary.author;
        publisher = data.summary.publisher;
        publishedDate = data.summary.pubdate;
      }
      
      // 説明文を抽出
      if (data.onix?.CollateralDetail?.TextContent) {
        // 説明文を探す
        const descriptionContent = data.onix.CollateralDetail.TextContent.find(
          content => content.TextType === '03'
        );
        
        // 目次を探す
        const tocContent = data.onix.CollateralDetail.TextContent.find(
          content => content.TextType === '04'
        );
        
        if (descriptionContent) {
          description = descriptionContent.Text;
        }
        
        if (tocContent) {
          tableOfContents = tocContent.Text;
        }
      }
      
      // 必要な情報のみを含むオブジェクトを返す
      const bookInfo = {
        title,
        author,
        publisher,
        publishedDate,
        description,
        tableOfContents
      };
      
      return success(bookInfo);
    } catch (error) {
      return failure('OpenBD_API_Error');
    }
  }
  
  /**
   * 書籍情報を補完する
   * @param book 補完対象の書籍
   * @returns 補完された書籍情報
   */
  async enrichBook(book: Book): Promise<Result<Book, BiblioinfoErrorStatus>> {
    // 実装すべき処理:
    // 1. 書籍のISBNを使用して詳細情報を取得
    // 2. 取得した情報で書籍情報を補完
    // 3. 補完された書籍情報を返す
    
    try {
      const result = await this.fetchInfoByIsbn(book.isbn.toString());
      
      if (result.type === 'failure') {
        return result;
      }
      
      // 取得した追加情報
      const fetchedInfo = result.value;
      
      // 新しい情報は既存情報がない場合のみ使用
      const enrichedBook: Book = {
        id: book.id,
        isbn: book.isbn,
        title: book.title || fetchedInfo.title || '',
        author: book.author || fetchedInfo.author || '',
        publisher: book.publisher || fetchedInfo.publisher || '',
        publishedDate: book.publishedDate || fetchedInfo.publishedDate || '',
        bookmeterUrl: book.bookmeterUrl,
        libraryAvailability: book.libraryAvailability,
        description: book.description || fetchedInfo.description,
        tableOfContents: book.tableOfContents || fetchedInfo.tableOfContents
      };
      
      return success(enrichedBook);
    } catch {
      return failure('OpenBD_API_Error');
    }
  }
}
