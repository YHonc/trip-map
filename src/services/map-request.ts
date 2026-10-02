import type { CacheKind, PublicMapConfig } from '@/lib/map-config';
import { recordCache } from '@/lib/debug';
let revision: string | undefined;
let config: PublicMapConfig | undefined;
const CACHE_NAME = 'trip-map-responses-v1';
const INVALIDATION_KEY = 'trip-map-cache-invalidation';
let configuredInvalidation = '';
function invalidation() { try { return typeof localStorage === 'undefined' ? '' : localStorage.getItem(INVALIDATION_KEY) ?? ''; } catch { return ''; } }
export function invalidateBrowserMapCache() {
  try { localStorage.setItem(INVALIDATION_KEY, crypto.randomUUID()); } catch {}
}
export function mapCacheNamespace() { return JSON.stringify([revision, config?.cacheEpoch, invalidation()]); }
export function setMapRevision(value: string) { revision = value; }
export function configureMapCache(value: PublicMapConfig) { config = value; configuredInvalidation = invalidation(); setMapRevision(value.revision); }
function cacheKind(input: string, init?: RequestInit): CacheKind | undefined {
  const path = input.split('?')[0];
  if (path === '/api/amap/route' && init?.method === 'POST' && typeof init.body === 'string') {
    try { const mode = JSON.parse(init.body).mode; return ['driving', 'walking', 'riding', 'subway'].includes(mode) ? mode : undefined; } catch { return; }
  }
  if (init?.method && init.method !== 'GET') return;
  if (path === '/api/amap/cities') return 'city';
  if (['/api/amap/search', '/api/amap/place', '/api/amap/regeocode'].includes(path)) return 'search';
}
export async function mapFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (revision) headers.set('X-Map-Revision', revision);
  const current = config, kind = cacheKind(input, init);
  let cache: Cache | undefined, key: string | undefined;
  if (current?.cache.enabled && configuredInvalidation === invalidation() && kind && typeof window !== 'undefined' && typeof caches !== 'undefined') {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([current.revision, current.cacheEpoch, input, init?.body])));
      key = `${window.location.origin}/__map_cache/${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
      cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(key);
      init?.signal?.throwIfAborted();
      if (hit && Number(hit.headers.get('X-Map-Expires-At')) > Date.now()) {
        recordCache('地图数据', '浏览器缓存命中');
        return hit;
      }
      if (hit) await cache.delete(key);
    } catch { cache = undefined; }
  }
  init?.signal?.throwIfAborted();
  const response = await fetch(input, { ...init, headers });
  if (response.ok && cache && key && current && current === config && configuredInvalidation === invalidation() && kind) {
    try {
      const body = await response.clone().text();
      // Keep large road geometries in SQLite; browser cache is a bounded fast path.
      if (body.length <= 500_000) {
        const storedHeaders = new Headers(response.headers);
        const fetchedAt = Number(response.headers.get('X-Map-Calculated-At')) || Date.now();
        storedHeaders.set('X-Map-Expires-At', String(fetchedAt + current.cache.ttl[kind] * 60_000));
        storedHeaders.set('X-Amap-Upstream-Requests', '0');
        storedHeaders.set('X-Map-Cache', 'browser');
        await cache.put(key, new Response(body, { headers: storedHeaders }));
        const entries = await cache.keys();
        await Promise.all(entries.slice(0, Math.max(0, entries.length - 128)).map(entry => cache!.delete(entry)));
      }
    } catch { /* Storage eviction or private mode must not block the map. */ }
  }
  return response;
}
