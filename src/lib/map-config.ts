export type CacheKind = 'city' | 'search' | 'driving' | 'walking' | 'riding' | 'subway';
export type CachePolicy = { enabled: boolean; maxMB: number; ttl: Record<CacheKind, number> };
export type PublicMapConfig = {
  provider: 'mock' | 'amap'; jsKey: string; hasWebKey: boolean; hasSecurityCode: boolean;
  baseURL: string; revision: string; cacheEpoch?: string; cache: CachePolicy; ready: boolean; missing: string[];
};
// Minutes; user may shorten/disable retention to match their service authorization.
export const MAP_CACHE_MINUTES = 3 * 24 * 60;
export const defaultCachePolicy: CachePolicy = { enabled: true, maxMB: 128, ttl: { city: MAP_CACHE_MINUTES, search: MAP_CACHE_MINUTES, driving: MAP_CACHE_MINUTES, walking: MAP_CACHE_MINUTES, riding: MAP_CACHE_MINUTES, subway: MAP_CACHE_MINUTES } };
