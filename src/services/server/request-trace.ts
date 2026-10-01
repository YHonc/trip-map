import { AsyncLocalStorage } from 'node:async_hooks';
import { recordMapUsage } from './map-usage';
import type { MapUsageEndpoint } from '@/lib/map-usage';
const trace = new AsyncLocalStorage<{ upstream: number; cache?: string; fetchedAt?: number }>();
export function markCacheResult(cache: string, fetchedAt: number) { const current = trace.getStore(); if (current) { current.cache = cache; current.fetchedAt = fetchedAt; } }
export function markUpstreamRequest(endpoint?: MapUsageEndpoint) {
  const current = trace.getStore(); if (current) current.upstream++;
  if (endpoint) recordMapUsage(endpoint);
}
export function withRequestTrace(handler: (request: Request) => Promise<Response>) {
  return (request: Request) => trace.run({ upstream: 0 }, async () => {
    const response = await handler(request);
    response.headers.set('X-Amap-Upstream-Requests', String(trace.getStore()!.upstream));
    if (trace.getStore()!.cache) response.headers.set('X-Map-Cache', trace.getStore()!.cache!);
    if (trace.getStore()!.fetchedAt) response.headers.set('X-Map-Calculated-At', String(trace.getStore()!.fetchedAt));
    if (process.env.NODE_ENV === 'development' && new URL(request.url).pathname === '/api/amap/route') {
      const current = trace.getStore()!;
      console.info(`[地图路线] ${response.status} · 缓存=${current.cache ?? '未命中或失败'} · 高德请求=${current.upstream} 次`);
    }
    return response;
  });
}
