/**
 * 指定したミリ秒だけ待機する
 * @param ms ミリ秒
 * @returns 解決されるPromise
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 指定した範囲内のランダムな時間だけ待機する
 * @param baseMs 基準となるミリ秒
 * @param minFactor 最小係数（デフォルト: 0.8）
 * @param maxFactor 最大係数（デフォルト: 1.2）
 * @returns 解決されるPromise
 */
export async function randomWait(
  baseMs: number,
  minFactor: number = 0.8,
  maxFactor: number = 1.2
): Promise<void> {
  const factor = minFactor + Math.random() * (maxFactor - minFactor);
  const ms = Math.floor(baseMs * factor);
  return sleep(ms);
}

/**
 * プロミスのバッチ処理を行うためのヘルパークラス
 * 
 * @example
 * const queue = new PromiseQueue<Book>();
 * for (const url of urls) {
 *   queue.add(() => scrapeBook(url));
 * }
 * const books = await queue.all();
 */
export class PromiseQueue<T> {
  private queue: Array<() => Promise<T>> = [];
  private results: T[] = [];
  private running = 0;
  
  /**
   * キューにプロミスを追加
   */
  add(fn: () => Promise<T>): void {
    this.queue.push(fn);
  }
  
  /**
   * 指定した並行数まで同時実行し、結果を待機
   */
  async wait(maxConcurrent: number): Promise<T[]> {
    while (this.running < maxConcurrent && this.queue.length > 0) {
      const fn = this.queue.shift()!;
      this.running++;
      
      // 非同期実行
      fn().then(result => {
        this.results.push(result);
        this.running--;
      }).catch(() => {
        this.running--;
      });
    }
    
    // 現在の結果を返す
    return [...this.results];
  }
  
  /**
   * すべてのプロミスが完了するまで待機
   */
  async all(): Promise<T[]> {
    const promises = this.queue.map(fn => fn());
    this.queue = [];
    
    const newResults = await Promise.all(promises);
    return [...this.results, ...newResults];
  }
}

/**
 * バッチ処理を行うユーティリティ関数
 * 指定された配列をバッチに分割し、各バッチを指定された同時実行数で処理する
 * 
 * @param items 処理する項目の配列
 * @param processor 各項目を処理する関数
 * @param options オプション（バッチサイズ、同時実行数、遅延）
 * @returns 処理結果の配列
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    batchSize?: number; 
    concurrency?: number;
    delay?: number;
  } = {}
): Promise<R[]> {
  const { batchSize = 10, concurrency = 3, delay = 0 } = options;
  const results: R[] = [];
  
  // バッチに分割
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  // 一定の並列数でバッチを処理
  for (let i = 0; i < batches.length; i += concurrency) {
    const currentBatches = batches.slice(i, i + concurrency);
    
    // 各バッチを並列処理
    const batchResults = await Promise.all(
      currentBatches.map(async batch => {
        // バッチ内のアイテムを処理
        const batchItemResults: R[] = [];
        for (const item of batch) {
          const result = await processor(item);
          batchItemResults.push(result);
        }
        return batchItemResults;
      })
    );
    
    // 結果を集約
    for (const batchResult of batchResults) {
      results.push(...batchResult);
    }
    
    // 次のバッチ処理の前に待機（レート制限対策）
    if (delay > 0 && i + concurrency < batches.length) {
      await sleep(delay);
    }
  }
  
  return results;
}
