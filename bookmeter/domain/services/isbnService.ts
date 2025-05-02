import { success, failure } from '../models/valueObjects';

import type { ISBN10, ISBN13, Result} from '../models/valueObjects';

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
    // 実装すべき処理:
    // 1. ISBNからハイフンなどの記号を除去
    // 2. 長さが10文字であることを確認
    // 3. チェックディジットの検証を行う
    // 4. 検証結果を返す
    
    try {
      const cleanedIsbn = isbn.replace(/[-\s]/g, '');
      
      if (cleanedIsbn.length !== 10) {
        return failure(new Error('ISBN-10は10桁でなければなりません'));
      }
      
      // チェックディジット計算（最後の桁はXまたは数字）
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        const digit = parseInt(cleanedIsbn.charAt(i), 10);
        if (isNaN(digit)) {
          return failure(new Error('ISBN-10の最初の9桁は数字でなければなりません'));
        }
        sum += digit * (10 - i);
      }
      
      // 最後の桁の処理（Xは10として扱う）
      const lastChar = cleanedIsbn.charAt(9);
      const lastDigit = lastChar === 'X' ? 10 : parseInt(lastChar, 10);
      
      if (isNaN(lastDigit) && lastChar !== 'X') {
        return failure(new Error('ISBN-10の最後の桁は数字またはXでなければなりません'));
      }
      
      sum += lastDigit;
      
      return success(sum % 11 === 0);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('ISBN-10の検証中にエラーが発生しました'));
    }
  }
  
  /**
   * ISBN-13の検証を行う
   * @param isbn 検証対象のISBN文字列
   * @returns 検証結果
   */
  static validateISBN13(isbn: string): Result<boolean> {
    // 実装すべき処理:
    // 1. ISBNからハイフンなどの記号を除去
    // 2. 長さが13文字であることを確認
    // 3. 978または979で始まることを確認
    // 4. チェックディジットの検証を行う
    // 5. 検証結果を返す
    
    try {
      const cleanedIsbn = isbn.replace(/[-\s]/g, '');
      
      if (cleanedIsbn.length !== 13) {
        return failure(new Error('ISBN-13は13桁でなければなりません'));
      }
      
      if (!cleanedIsbn.startsWith('978') && !cleanedIsbn.startsWith('979')) {
        return failure(new Error('ISBN-13は978または979で始まる必要があります'));
      }
      
      // チェックディジット計算
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(cleanedIsbn.charAt(i), 10);
        if (isNaN(digit)) {
          return failure(new Error('ISBN-13は数字のみで構成されている必要があります'));
        }
        sum += digit * (i % 2 === 0 ? 1 : 3);
      }
      
      const checkDigit = parseInt(cleanedIsbn.charAt(12), 10);
      const calculatedCheckDigit = (10 - (sum % 10)) % 10;
      
      return success(checkDigit === calculatedCheckDigit);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('ISBN-13の検証中にエラーが発生しました'));
    }
  }
  
  /**
   * ISBN-10をISBN-13に変換する
   * @param isbn10 変換対象のISBN-10文字列
   * @returns 変換結果
   */
  static convertISBN10ToISBN13(isbn10: string): Result<ISBN13> {
    // 実装すべき処理:
    // 1. ISBN-10の形式を検証
    // 2. ISBN-10の最初の9桁を取得
    // 3. 先頭に978を追加
    // 4. チェックディジットを計算
    // 5. 変換結果を返す
    
    try {
      const isValid = this.validateISBN10(isbn10);
      if (!isValid || (isValid.type === 'success' && !isValid.value)) {
        return failure(new Error('有効なISBN-10ではありません'));
      }
      
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
      const isbn13 = `${isbn12}${checkDigit}` as ISBN13;
      
      return success(isbn13);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('ISBN-10からISBN-13への変換中にエラーが発生しました'));
    }
  }
  
  /**
   * ISBN文字列から適切な型（ISBN10またはISBN13）に変換する
   * @param isbnStr ISBN文字列
   * @returns 変換結果
   */
  static parseISBN(isbnStr: string): Result<ISBN10 | ISBN13> {
    // 実装すべき処理:
    // 1. 文字列からハイフンなどの記号を除去
    // 2. 長さに基づいてISBN-10かISBN-13かを判断
    // 3. 適切な検証を実行
    // 4. 検証に成功した場合、適切な型にキャストして返す
    
    try {
      const cleanedIsbn = isbnStr.replace(/[-\s]/g, '');
      
      if (cleanedIsbn.length === 10) {
        const isValid = this.validateISBN10(cleanedIsbn);
        if (isValid.type === 'success' && isValid.value) {
          return success(cleanedIsbn as ISBN10);
        }
        return failure(new Error('無効なISBN-10です'));
      } else if (cleanedIsbn.length === 13) {
        const isValid = this.validateISBN13(cleanedIsbn);
        if (isValid.type === 'success' && isValid.value) {
          return success(cleanedIsbn as ISBN13);
        }
        return failure(new Error('無効なISBN-13です'));
      }
      
      return failure(new Error('ISBNは10桁または13桁である必要があります'));
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('ISBN解析中にエラーが発生しました'));
    }
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
}
