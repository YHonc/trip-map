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
    return response;
  });
}
