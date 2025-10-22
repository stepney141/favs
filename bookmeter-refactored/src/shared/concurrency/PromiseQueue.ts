export type QueueTask<T> = () => Promise<T>;

export class PromiseQueue {
  private readonly concurrency: number;
  private activeCount = 0;
  private readonly queue: Array<{ task: QueueTask<any>; resolve: (value: any) => void; reject: (reason?: unknown) => void }> = [];

  constructor(concurrency: number) {
    if (concurrency < 1) throw new Error("Concurrency must be >= 1");
    this.concurrency = concurrency;
  }

  enqueue<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeCount >= this.concurrency) return;
    const item = this.queue.shift();
    if (!item) return;

    this.activeCount += 1;
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeCount -= 1;
      this.processQueue();
    }
  }
}
