import { parseAmapPlaces, parseAmapRoute } from '../amap-api';
import type { Coordinate, TravelMode } from '@/lib/types';
import { RequestCache } from '@/lib/request-cache';
import { markUpstreamRequest } from './request-trace';
import { readMapConfig, type MapConfig } from './map-config';
import { cachedMap } from './map-cache';
import { parseAmapAddress } from '@/lib/map-pick';
let nextSlot = 0;
export async function waitForAmapSlot() {
  const now = Date.now();
  const delay = Math.max(0, nextSlot - now);
  if (delay > 4000) throw new Error('高德请求排队较多，请稍后重试');
  nextSlot = Math.max(now, nextSlot) + 400;
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
}

const caches = new WeakMap<typeof fetch, RequestCache<{ value: unknown }>>();
function reuse<T>(fetcher: typeof fetch, key: string, run: () => Promise<T>): Promise<T> {
  let cache = caches.get(fetcher);
  if (!cache) { cache = new RequestCache(256, 60_000); caches.set(fetcher, cache); }
  return cache.get(`${process.env.AMAP_WEB_KEY}:${key}`, async () => ({ value: await run() })).then(r => r.value as T);
}
export function routeAmap(origin: Coordinate, destination: Coordinate, mode: TravelMode, fetcher: typeof fetch = fetch) {
  const config = readMapConfig();
  const run = () => routeUncached(origin, destination, mode, fetcher, config);
  const point = (p: Coordinate) => p && [Number(p.lng?.toFixed?.(6)), Number(p.lat?.toFixed?.(6))];
  return fetcher !== fetch ? reuse(fetcher, JSON.stringify(['route', origin, destination, mode]), run) : cachedMap(mode, [point(origin), point(destination)], config, run);
}
export function searchAmap(keyword: string, fetcher: typeof fetch = fetch, city?: string) {
  if (!keyword.trim() || keyword.length > 100) throw new Error('搜索词应为 1–100 个字符');
  if (city !== undefined && !/^\d{6}$/.test(city)) throw new Error('城市编码无效');
  const config = readMapConfig();
  const run = () => searchUncached(keyword, fetcher, city, config);
  return fetcher !== fetch ? reuse(fetcher, JSON.stringify(['search', keyword.trim(), city]), run) : cachedMap('search', [keyword.trim(), city, 1, 20], config, run);
}

export function detailAmap(id: string, fetcher: typeof fetch = fetch) {
  if (!/^[a-z\d]{1,64}$/i.test(id)) throw new Error('地点编号无效');
  const config = readMapConfig();
  const run = async () => {
    if (!config.webKey) throw new Error('未配置 AMAP_WEB_KEY');
    checkBudget();
    if (fetcher === fetch) await waitForAmapSlot();
    const url = new URL(`${config.baseURL}/v3/place/detail`);
    url.search = new URLSearchParams({ key: config.webKey, id, extensions: 'base', output: 'JSON' }).toString();
    markUpstreamRequest('detail');
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('地点详情服务暂不可用');
    const place = parseAmapPlaces(await response.json()).find(place => place.poiId === id);
    if (!place) throw new Error('暂未找到这个地标的详细信息');
    return place;
  };
  return fetcher !== fetch ? reuse(fetcher, JSON.stringify(['detail', id]), run) : cachedMap('search', ['detail', id], config, run);
}

export function reverseAmap(point: Coordinate, fetcher: typeof fetch = fetch): Promise<string> {
  if (!point || !Number.isFinite(point.lng) || !Number.isFinite(point.lat) || Math.abs(point.lng) > 180 || Math.abs(point.lat) > 90) throw new Error('无效的地图坐标');
  const config = readMapConfig();
  const location = `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
  const run = async () => {
    if (!config.webKey) throw new Error('未配置 AMAP_WEB_KEY');
    checkBudget();
    if (fetcher === fetch) await waitForAmapSlot();
    const url = new URL(`${config.baseURL}/v3/geocode/regeo`);
    url.search = new URLSearchParams({ key: config.webKey, location, extensions: 'base', output: 'JSON' }).toString();
    markUpstreamRequest('regeo');
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('地址查询服务暂不可用');
    return parseAmapAddress(await response.json());
  };
  return fetcher !== fetch ? reuse(fetcher, JSON.stringify(['regeo', location]), run) : cachedMap('search', ['regeo', location], config, run);
}

async function routeUncached(origin: Coordinate, destination: Coordinate, mode: TravelMode, fetcher: typeof fetch, config: MapConfig) {
  for (const point of [origin, destination])
    if (!point || typeof point.lng !== 'number' || typeof point.lat !== 'number' || !Number.isFinite(point.lng) || !Number.isFinite(point.lat) || Math.abs(point.lng) > 180 || Math.abs(point.lat) > 90) throw new Error('无效的路线坐标');
  const paths = { driving: 'v3/direction/driving', walking: 'v3/direction/walking', riding: 'v4/direction/bicycling' };
  if (!Object.hasOwn(paths, mode)) throw new Error('不支持的交通方式');
  const key = config.webKey;
  if (!key) throw new Error('未配置 AMAP_WEB_KEY');
  checkBudget();
  if (fetcher === fetch) await waitForAmapSlot();
  const url = new URL(`${config.baseURL}/${paths[mode]}`);
  const coordinate = (p: Coordinate) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
  url.search = new URLSearchParams({ key, origin: coordinate(origin), destination: coordinate(destination), output: 'JSON' }).toString();
  markUpstreamRequest(mode);
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error('高德规划服务暂不可用');
  return parseAmapRoute(await response.json(), mode, origin, destination);
}

// Process-wide budget: callers cannot evade it with a forged forwarded-IP header.
let windowStart = 0;
let requests = 0;
export function checkBudget(limit = 60) {
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
  if (++requests > limit) throw new Error('请求过于频繁，请稍后重试');
}
async function searchUncached(keyword: string, fetcher: typeof fetch, city: string | undefined, config: MapConfig) {
  if (!keyword.trim() || keyword.length > 100) throw new Error('搜索词应为 1–100 个字符');
  const key = config.webKey;
  if (!key) throw new Error('未配置 AMAP_WEB_KEY');
  checkBudget();
  if (fetcher === fetch) await waitForAmapSlot();
  const url = new URL(`${config.baseURL}/v3/place/text`);
  url.search = new URLSearchParams({ key, keywords: keyword.trim(), offset: '20', page: '1', extensions: 'base', output: 'JSON', ...(city ? { city, citylimit: 'true' } : {}) }).toString();
  markUpstreamRequest('search');
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error('高德搜索服务暂不可用');
  return parseAmapPlaces(await response.json());
}
