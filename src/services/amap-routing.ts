import type { Coordinate, RouteGeometry, TravelMode } from '@/lib/types';
import { LRUCache } from 'lru-cache';
import { recordCache } from '@/lib/debug';
import { mapFetch, mapCacheNamespace } from './map-request';

// Bounded session reuse sits above browser and SQLite persistence in mapFetch.
const segments = new Map<string, { pending: Promise<RouteGeometry>; consumers: Set<() => boolean> }>();
const completed = new LRUCache<string, RouteGeometry>({ max: 256, ttl: 300_000 });
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try { return await fn(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}
export const sameCoordinate = (a: Coordinate, b: Coordinate) => a.lng === b.lng && a.lat === b.lat;
export type RouteSegments = Map<string, RouteGeometry>;
const segmentKey = (mode: TravelMode, origin: Coordinate, destination: Coordinate, city?: string) => JSON.stringify([mapCacheNamespace(), mode, origin.lng, origin.lat, destination.lng, destination.lat, mode === 'subway' ? city : undefined]);
export async function calculateAmapRoute(stops: Coordinate[], mode: TravelMode, isCurrent: () => boolean = () => true, retained?: RouteSegments, city?: string): Promise<RouteGeometry> {
  if (!isCurrent()) throw new Error('路线已修改，停止旧任务');
  // Keep only the current route's directed edges. Their displayed geometry stays
  // usable during editing even after the shared short-term cache expires/evicts.
  const live = new Set(stops.slice(1).flatMap((destination, i) => sameCoordinate(stops[i], destination) ? [] : [segmentKey(mode, stops[i], destination, city)]));
  if (retained) for (const key of retained.keys()) if (!live.has(key)) retained.delete(key);
  const geometries: RouteGeometry[] = [];
  const legs: NonNullable<RouteGeometry['legs']> = [];
  const append = (geometry: RouteGeometry) => { geometries.push(geometry); legs.push({ distance: geometry.distance, duration: geometry.duration }); };
  for (let i = 1; i < stops.length; i++) {
    if (!isCurrent()) throw new Error('路线已修改，停止旧任务');
    const origin = stops[i - 1], destination = stops[i];
    if (sameCoordinate(origin, destination)) { legs.push({ distance: 0, duration: 0 }); continue; }
    const key = segmentKey(mode, origin, destination, city);
    const unchanged = retained?.get(key);
    if (unchanged && (!unchanged.expiresAt || unchanged.expiresAt > Date.now())) { recordCache('路线片段', '未变路段复用'); append(unchanged); continue; }
    const cached = completed.get(key);
    if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) { recordCache('路线片段', '本地缓存命中'); retained?.set(key, cached); append(cached); continue; }
    let entry = segments.get(key);
    if (entry) recordCache('路线片段', '合并进行中请求');
    if (!entry) {
      const consumers = new Set([isCurrent]);
      const pending = limited(async () => {
        if (![...consumers].some(current => current())) throw new Error('路线已修改，停止排队任务');
        const response = await mapFetch('/api/amap/route', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: { lng: origin.lng, lat: origin.lat }, destination: { lng: destination.lng, lat: destination.lat }, mode, ...(mode === 'subway' ? { city } : {}) }),
          signal: AbortSignal.timeout(12_000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? '高德路线规划失败');
        return result as RouteGeometry;
      }).then(result => { completed.set(key, result); return result; })
        .finally(() => { if (segments.get(key)?.pending === pending) segments.delete(key); });
      entry = { pending, consumers };
      segments.set(key, entry);
    }
    entry.consumers.add(isCurrent);
    try {
      const geometry = await entry.pending;
      if (!isCurrent()) throw new Error('路线已修改，停止旧任务');
      retained?.set(key, geometry);
      append(geometry);
    }
    finally { entry.consumers.delete(isCurrent); }
    if (!isCurrent()) throw new Error('路线已修改，停止旧任务');
  }
  return {
    legs,
    calculatedAt: geometries.length && geometries.every(g => g.calculatedAt) ? Math.min(...geometries.map(g => g.calculatedAt!)) : undefined,
    expiresAt: geometries.length && geometries.every(g => g.expiresAt) ? Math.min(...geometries.map(g => g.expiresAt!)) : undefined,
    source: 'amap', path: geometries.flatMap(g => g.path), paths: geometries.flatMap(g => g.paths ?? [g.path]),
    connectors: geometries.flatMap(g => g.connectors ?? []),
    distance: geometries.reduce((n, g) => n + g.distance, 0), duration: geometries.reduce((n, g) => n + g.duration, 0),
  };
}
