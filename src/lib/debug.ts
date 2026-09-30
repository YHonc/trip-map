'use client';
export type DebugEntry = { time: string; call: string; params: Record<string, unknown>; duration: number; status: string; upstream?: number };
let enabled = false;
let entries: DebugEntry[] = [];
const listeners = new Set<() => void>();
export const debugSubscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const debugSnapshot = () => entries;
export function clearDebug() { entries = []; listeners.forEach(fn => fn()); }
export function recordDebug(entry: DebugEntry) { if (enabled) { entries = [...entries.slice(-199), entry]; listeners.forEach(fn => fn()); } }
export function recordCache(call: string, status: string) { recordDebug({ time: new Date().toISOString(), call, status, params: {}, duration: 0, upstream: 0 }); }
export function enableDebug(value: boolean) { enabled = value; }
// Explicit allowlist: never retain headers, credentials, AI prompts or response bodies.
export function debugParams(url: URL, body?: BodyInit | null): Record<string, unknown> {
  const allowed = ['q', 'city', 'keyword', 'mode', 'origin', 'destination'];
  const raw: Record<string, unknown> = Object.fromEntries(url.searchParams);
  if (typeof body === 'string') { try { Object.assign(raw, JSON.parse(body)); } catch {} }
  return Object.fromEntries(allowed.filter(key => key in raw).map(key => {
    const value = raw[key];
    if (key === 'origin' || key === 'destination') {
      const point = value as { lng?: unknown; lat?: unknown };
      return [key, { lng: typeof point?.lng === 'number' ? point.lng : null, lat: typeof point?.lat === 'number' ? point.lat : null }];
    }
    return [key, typeof value === 'string' ? value.slice(0, 100) : null];
  }));
}
export function installDebugFetch() {
  const original = window.fetch;
  const wrapped: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!enabled || url.origin !== location.origin || !url.pathname.startsWith('/api/')) return original(input, init);
    const start = performance.now(), time = new Date().toISOString();
    const params = url.pathname.startsWith('/api/amap/') ? debugParams(url, init?.body) : {};
    try {
      const response = await original(input, init);
      const count = response.headers.get('X-Amap-Upstream-Requests');
      const cache = response.headers.get('X-Map-Cache');
      if (cache) recordCache('服务端缓存', ({ memory: '内存命中', disk: 'SQLite 磁盘命中', merged: '合并进行中请求', upstream: '请求上游' } as Record<string, string>)[cache] || cache);
      recordDebug({ time, call: `${init?.method ?? 'GET'} ${url.pathname}`, params, duration: Math.round(performance.now() - start), status: `${response.status} ${response.ok ? '成功' : '失败'}`, ...(count === null ? {} : { upstream: Number(count) }) });
      return response;
    } catch (error) {
      recordDebug({ time, call: `${init?.method ?? 'GET'} ${url.pathname}`, params, duration: Math.round(performance.now() - start), status: '网络失败 / 超时' });
      throw error;
    }
  };
  window.fetch = wrapped;
  return () => { if (window.fetch === wrapped) window.fetch = original; };
}
