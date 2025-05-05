/**
 * 依存性注入で使用するシンボル
 */
export const TYPES = {
  // インフラストラクチャ
  Logger: Symbol.for("Logger"),
  BookRepository: Symbol.for("BookRepository"),
  BookScraperService: Symbol.for("BookScraperService"),
  BiblioInfoProvider: Symbol.for("BiblioInfoProvider"),
  StorageService: Symbol.for("StorageService"),
  
  // ユースケース
  GetBookListUseCase: Symbol.for("GetBookListUseCase"),
  FetchBiblioInfoUseCase: Symbol.for("FetchBiblioInfoUseCase"),
  SaveBookListUseCase: Symbol.for("SaveBookListUseCase"),
  CrawlBookDescriptionUseCase: Symbol.for("CrawlBookDescriptionUseCase")
};
