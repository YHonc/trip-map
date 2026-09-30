import { LRUCache } from 'lru-cache';

/** Only successful values expire/evict; in-flight requests retain their identity. */
export class RequestCache<T extends {}> {
  private values: LRUCache<string, T>;
  private pending = new Map<string, Promise<T>>();
  constructor(max = 256, ttl = 300_000) { this.values = new LRUCache({ max, ttl }); }
  get(key: string, run: () => Promise<T>, onReuse?: (status: string) => void): Promise<T> {
    const value = this.values.get(key);
    if (value !== undefined) { onReuse?.('本地缓存命中'); return Promise.resolve(value); }
    const existing = this.pending.get(key);
    if (existing) { onReuse?.('合并进行中请求'); return existing; }
    const task = Promise.resolve().then(run).then(result => {
      this.values.set(key, result);
      return result;
    }).finally(() => { if (this.pending.get(key) === task) this.pending.delete(key); });
    this.pending.set(key, task);
    return task;
  }
}
