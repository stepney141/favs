import { tryCatch, pipe, left, right, chain } from '../models/either';
import { toEither, fromEither } from '../models/valueObjects';

import type { Option } from '../models/option';
import type { ISBN10, ISBN13, Result } from '../models/valueObjects';

/**
 * ISBN関連のドメインサービス
 * ISBNの検証や変換を行う
 */
export class IsbnService {
  /**
   * ISBN-10の検証を行う
   * @param isbn 検証対象のISBN文字列
   * @returns 検証結果
   */
  static validateISBN10(isbn: string): Result<boolean> {
    // tryCatchを使用して例外をハンドリング
    const result = tryCatch<Error, boolean>(
      () => {
        const cleanedIsbn = isbn.replace(/[-\s]/g, '');
        
        if (cleanedIsbn.length !== 10) {
          throw new Error('ISBN-10は10桁でなければなりません');
        }
        
        // チェックディジット計算
        let sum = 0;
        for (let i = 0; i < 9; i++) {
          const digit = parseInt(cleanedIsbn.charAt(i), 10);
          if (isNaN(digit)) {
            throw new Error('ISBN-10の最初の9桁は数字でなければなりません');
          }
          sum += digit * (10 - i);
        }
        
        // 最後の桁の処理
        const lastChar = cleanedIsbn.charAt(9);
        const lastDigit = lastChar === 'X' ? 10 : parseInt(lastChar, 10);
        
        if (isNaN(lastDigit) && lastChar !== 'X') {
          throw new Error('ISBN-10の最後の桁は数字またはXでなければなりません');
        }
        
        sum += lastDigit;
        
        return sum % 11 === 0;
      },
      (error): Error => error instanceof Error ? error : new Error('ISBN-10の検証中にエラーが発生しました')
    );
    
    // Eitherの結果をResultに変換
    return fromEither(result);
  }
  
  /**
   * ISBN-13の検証を行う
   * @param isbn 検証対象のISBN文字列
   * @returns 検証結果
   */
  static validateISBN13(isbn: string): Result<boolean> {
    // tryCatchを使用して例外をハンドリング
    const result = tryCatch<Error, boolean>(
      () => {
        const cleanedIsbn = isbn.replace(/[-\s]/g, '');
        
        if (cleanedIsbn.length !== 13) {
          throw new Error('ISBN-13は13桁でなければなりません');
        }
        
        if (!cleanedIsbn.startsWith('978') && !cleanedIsbn.startsWith('979')) {
          throw new Error('ISBN-13は978または979で始まる必要があります');
        }
        
        // チェックディジット計算
        let sum = 0;
        for (let i = 0; i < 12; i++) {
          const digit = parseInt(cleanedIsbn.charAt(i), 10);
          if (isNaN(digit)) {
            throw new Error('ISBN-13は数字のみで構成されている必要があります');
          }
          sum += digit * (i % 2 === 0 ? 1 : 3);
        }
        
        const checkDigit = parseInt(cleanedIsbn.charAt(12), 10);
        const calculatedCheckDigit = (10 - (sum % 10)) % 10;
        
        return checkDigit === calculatedCheckDigit;
      },
      (error): Error => error instanceof Error ? error : new Error('ISBN-13の検証中にエラーが発生しました')
    );
    
    // Eitherの結果をResultに変換
    return fromEither(result);
  }
  
  /**
   * ISBN-10をISBN-13に変換する
   * @param isbn10 変換対象のISBN-10文字列
   * @returns 変換結果
   */
  static convertISBN10ToISBN13(isbn10: string): Result<ISBN13> {
    // パイプラインを使った関数型アプローチ
    const result = pipe(
      // ISBN10の検証
      this.validateISBN10(isbn10),
      // ResultをEitherに変換
      toEither,
      // 検証結果を確認
      chain(isValid => 
        isValid ? right(undefined) : left(new Error('有効なISBN-10ではありません'))
      ),
      // 変換処理
      chain(() => tryCatch<Error, ISBN13>(
        () => {
          const cleanedIsbn = isbn10.replace(/[-\s]/g, '');
          const isbn9 = cleanedIsbn.substring(0, 9);
          const isbn12 = `978${isbn9}`;
          
          // チェックディジット計算
          let sum = 0;
          for (let i = 0; i < 12; i++) {
            const digit = parseInt(isbn12.charAt(i), 10);
            sum += digit * (i % 2 === 0 ? 1 : 3);
          }
          
          const checkDigit = (10 - (sum % 10)) % 10;
          return `${isbn12}${checkDigit}` as ISBN13;
        },
        (error): Error => error instanceof Error 
          ? error 
          : new Error('ISBN-10からISBN-13への変換中にエラーが発生しました')
      ))
    );
    
    // Eitherの結果をResultに変換
    return fromEither(result);
  }
  
  /**
   * ISBN文字列から適切な型（ISBN10またはISBN13）に変換する
   * @param isbnStr ISBN文字列
   * @returns 変換結果
   */
  static parseISBN(isbnStr: string): Result<ISBN10 | ISBN13> {
    // tryCatchを使用して例外をハンドリング
    const result = tryCatch<Error, ISBN10 | ISBN13>(
      () => {
        const cleanedIsbn = isbnStr.replace(/[-\s]/g, '');
        
        if (cleanedIsbn.length === 10) {
          const isValid = this.validateISBN10(cleanedIsbn);
          if (isValid.type === 'success' && isValid.value) {
            return cleanedIsbn as ISBN10;
          }
          throw new Error('無効なISBN-10です');
        } else if (cleanedIsbn.length === 13) {
          const isValid = this.validateISBN13(cleanedIsbn);
          if (isValid.type === 'success' && isValid.value) {
            return cleanedIsbn as ISBN13;
          }
          throw new Error('無効なISBN-13です');
        }
        
        throw new Error('ISBNは10桁または13桁である必要があります');
      },
      (error): Error => error instanceof Error ? error : new Error('ISBN解析中にエラーが発生しました')
    );
    
    // Eitherの結果をResultに変換
    return fromEither(result);
  }
  
  /**
   * ISBN文字列が有効かどうかを検証する
   * @param isbnStr ISBN文字列
   * @returns 検証結果
   */
  static isValidISBN(isbnStr: string): boolean {
    const result = this.parseISBN(isbnStr);
    return result.type === 'success';
  }
  
  /**
   * AmazonのURLからISBNを抽出する
   * @param amazonUrl AmazonのURL
   * @returns ISBNのOption型
   */
  static extractIsbnFromAmazonUrl(amazonUrl: string): Option<ISBN10 | ISBN13> {
    // URLからASINまたはISBNを抽出する正規表現
    const asinPattern = /\/(?:dp|product|ASIN)\/([A-Z0-9]{10})(?:\/|\?|$)/;
    const isbnPattern = /\/gp\/product\/([A-Z0-9]{10})(?:\/|\?|$)/;
    
    // 抽出したコードをISBNとして解析
    const asinMatch = amazonUrl.match(asinPattern);
    const isbnMatch = amazonUrl.match(isbnPattern);
    
    const code = asinMatch?.[1] || isbnMatch?.[1];
    
    // 抽出されたコードがない場合はnoneを返す
    if (!code) {
      return { _tag: 'None' };
    }
    
    // ISBNの場合は検証
    const isbnResult = this.parseISBN(code);
    
    if (isbnResult.type === 'success') {
      return {
        _tag: 'Some',
        value: isbnResult.value
      };
    }
    
    return { _tag: 'None' };
  }
  
  /**
   * ASINかどうかを判定する
   * @param code 検証対象のコード
   * @returns 検証結果
   */
  static isASIN(code: string): boolean {
    const asinPattern = /^[A-Z0-9]{10}$/;
    const isValidAsin = asinPattern.test(code);
    
    // ASIN形式だがISBN-10でもある場合はISBN-10として判定
    if (isValidAsin) {
      const isbnResult = this.validateISBN10(code);
      return !(isbnResult.type === 'success' && isbnResult.value);
    }
    
    return false;
  }
  
  /**
   * ISBN-10かどうかを判定する
   * @param code 検証対象のコード
   * @returns 検証結果
   */
  static isISBN10(code: string): boolean {
    const isbnResult = this.validateISBN10(code);
    return isbnResult.type === 'success' && isbnResult.value;
  }
  
  /**
   * ISBN-13かどうかを判定する
   * @param code 検証対象のコード
   * @returns 検証結果
   */
  static isISBN13(code: string): boolean {
    const isbnResult = this.validateISBN13(code);
    return isbnResult.type === 'success' && isbnResult.value;
  }
}
