import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { LRUCache } from 'lru-cache';
import { database } from './database';
import { dataFile } from './data-dir';
import type { MapConfig } from './map-config';
import type { CacheKind } from '@/lib/map-config';
import { markCacheResult } from './request-trace';

type Entry = { value: unknown; fetchedAt: number; expiresAt: number };
type CacheState = { memory: LRUCache<string, Entry>; pending: Map<string, Promise<Entry>> };
const shared = globalThis as typeof globalThis & { __tripMapCache?: CacheState };
const state = shared.__tripMapCache ??= { memory: new LRUCache({ max: 512 }), pending: new Map() };
function db() {
  const value = database('map-cache.sqlite');
  value.exec(`CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL, fetched_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, accessed_at INTEGER NOT NULL, bytes INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS cache_expiry ON entries(expires_at);
    CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO metadata(key,value) VALUES ('epoch','0');`);
  return value;
}
function count(name: string) { db().prepare('INSERT INTO counters(name,value) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET value=value+1').run(name); }
function epoch() { return (db().prepare("SELECT value FROM metadata WHERE key='epoch'").get() as { value: string }).value; }
function prune(maxBytes: number) {
  db().prepare('DELETE FROM entries WHERE expires_at<=?').run(Date.now());
  let bytes = (db().prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM entries').get() as { bytes: number }).bytes;
  if (bytes <= maxBytes) return;
  const rows = db().prepare('SELECT key,bytes FROM entries ORDER BY accessed_at').all() as { key: string; bytes: number }[];
  for (const row of rows) { db().prepare('DELETE FROM entries WHERE key=?').run(row.key); bytes -= row.bytes; if (bytes <= maxBytes) break; }
}
export async function cachedMap<T>(kind: CacheKind, parameters: unknown, config: MapConfig, run: () => Promise<T>): Promise<T> {
  const retention = config.cache.enabled;
  const generation = epoch();
  const hash = createHash('sha256').update(JSON.stringify(['amap-v1', 'GCJ-02', config.revision, config.baseURL, kind, parameters])).digest('hex');
  const key = `${dataFile('map-cache.sqlite')}:${generation}:${hash}`;
  const now = Date.now();
  const unpack = (entry: Entry, source: string) => {
    markCacheResult(source, entry.fetchedAt);
    if (kind === 'driving' || kind === 'walking' || kind === 'riding') return { ...(entry.value as object), calculatedAt: entry.fetchedAt, expiresAt: entry.expiresAt } as T;
    return structuredClone(entry.value) as T;
  };
  if (retention) {
    const memory = state.memory.get(key);
    if (memory && memory.expiresAt > now) { count('memory'); return unpack(memory, 'memory'); }
    state.memory.delete(key);
    const disk = db().prepare('SELECT value,fetched_at,expires_at FROM entries WHERE key=? AND expires_at>?').get(hash, now) as { value: string; fetched_at: number; expires_at: number } | undefined;
    if (disk) {
      try {
        const entry = { value: JSON.parse(disk.value), fetchedAt: disk.fetched_at, expiresAt: disk.expires_at };
        state.memory.set(key, entry);
        db().prepare('UPDATE entries SET accessed_at=? WHERE key=?').run(now, hash);
        count('disk'); return unpack(entry, 'disk');
      } catch { db().prepare('DELETE FROM entries WHERE key=?').run(hash); }
    }
  }
  const existing = state.pending.get(key);
  if (existing) { count('merged'); return unpack(await existing, 'merged'); }
  const task = (async (): Promise<Entry> => {
    count('upstream');
    let value: T;
    try { value = await run(); } catch (error) { count('errors'); throw error; }
    const fetchedAt = Date.now(), expiresAt = fetchedAt + config.cache.ttl[kind] * 60_000;
    const entry = { value, fetchedAt, expiresAt };
    if (retention && epoch() === generation) {
      const serialized = JSON.stringify(value), bytes = Buffer.byteLength(serialized);
      if (bytes <= config.cache.maxMB * 1024 * 1024) {
        db().transaction(() => {
          db().prepare('INSERT OR REPLACE INTO entries(key,kind,value,fetched_at,expires_at,accessed_at,bytes) VALUES (?,?,?,?,?,?,?)').run(hash, kind, serialized, fetchedAt, expiresAt, fetchedAt, bytes);
          prune(config.cache.maxMB * 1024 * 1024);
        })();
        state.memory.set(key, entry);
      }
    }
    return entry;
  })();
  state.pending.set(key, task);
  try { return unpack(await task, 'upstream'); }
  finally { if (state.pending.get(key) === task) state.pending.delete(key); }
}
export function cacheStats() {
  db().prepare('DELETE FROM entries WHERE expires_at<=?').run(Date.now());
  const groups = db().prepare('SELECT kind,COUNT(*) AS entries,COALESCE(SUM(bytes),0) AS bytes,MAX(fetched_at) AS latest FROM entries GROUP BY kind').all();
  const counters = Object.fromEntries((db().prepare('SELECT name,value FROM counters').all() as { name: string; value: number }[]).map(row => [row.name, row.value]));
  const file = dataFile('map-cache.sqlite');
  return { groups, counters, fileBytes: statSync(file).size, basemap: '由浏览器遵循高德响应头管理 HTTP 缓存；不支持下载区域或保证离线可用。' };
}
export function clearMapCache(kind?: CacheKind) {
  db().transaction(() => {
    if (kind) db().prepare('DELETE FROM entries WHERE kind=?').run(kind);
    else db().prepare('DELETE FROM entries').run();
    db().prepare("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='epoch'").run();
  })();
  state.memory.clear();
  db().pragma('wal_checkpoint(TRUNCATE)');
  db().exec('VACUUM');
}
