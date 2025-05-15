import type { ScrapingError } from "@/domain/models/errors";
import type { Result } from "@/domain/models/result";
import type { ISBN10 } from "@/domain/models/valueObjects";

/**
 * 書籍内容スクレイパーのポート
 * 書籍の内容情報（説明、目次など）を取得するスクレイピング処理を担当
 */
export interface BookContentScraperService {
  /**
   * 紀伊國屋書店から書籍の説明を取得
   * @param isbn 書籍のISBN10
   * @returns 書籍の説明文
   */
  scrapeBookDescription(isbn: ISBN10): Promise<Result<ScrapingError, string>>;
}
