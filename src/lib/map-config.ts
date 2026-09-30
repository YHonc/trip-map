export type CacheKind = 'city' | 'search' | 'driving' | 'walking' | 'riding';
export type CachePolicy = { enabled: boolean; maxMB: number; ttl: Record<CacheKind, number> };
export type PublicMapConfig = {
  provider: 'mock' | 'amap'; jsKey: string; hasWebKey: boolean; hasSecurityCode: boolean;
  baseURL: string; revision: string; cache: CachePolicy; ready: boolean; missing: string[];
};
// Minutes; user may shorten/disable retention to match their service authorization.
export const defaultCachePolicy: CachePolicy = { enabled: true, maxMB: 128, ttl: { city: 10080, search: 1440, driving: 15, walking: 1440, riding: 1440 } };
