import { createHash, randomUUID } from 'node:crypto';
import { readConfigFile, writeConfigFile } from './config-file';
import { defaultCachePolicy, type CacheKind, type CachePolicy, type PublicMapConfig } from '@/lib/map-config';
import { mapCacheEpoch } from './map-cache';

export type MapConfig = { provider: 'mock' | 'amap'; jsKey: string; webKey: string; securityCode: string; baseURL: string; revision: string; cache: CachePolicy; cacheVersion?: number };
export function migrateMapCache(config: MapConfig): MapConfig {
  if (config.cacheVersion === 2) return config.cache.ttl.subway === undefined ? { ...config, cache: { ...config.cache, ttl: { ...config.cache.ttl, subway: defaultCachePolicy.ttl.subway } } } : config;
  return { ...config, cacheVersion: 2, revision: `${config.revision}-3d`, cache: { ...config.cache, ttl: { ...defaultCachePolicy.ttl } } };
}
export function checkMapRevision(request: Request) {
  const revision = request.headers.get('X-Map-Revision');
  if (revision && revision !== readMapConfig().revision) throw new Error('地图设置已在其他窗口更新，请保存行程后刷新页面');
}
export function readMapConfig(): MapConfig {
  const stored = readConfigFile<MapConfig>('map-config.json', ['webKey', 'securityCode']);
  if (stored) return migrateMapCache(stored);
  const defaults = { provider: process.env.NEXT_PUBLIC_MAP_PROVIDER === 'amap' ? 'amap' as const : 'mock' as const, jsKey: process.env.NEXT_PUBLIC_AMAP_JS_KEY || '', webKey: process.env.AMAP_WEB_KEY || '', securityCode: process.env.AMAP_SECURITY_CODE || '', baseURL: 'https://restapi.amap.com', cache: structuredClone(defaultCachePolicy) };
  return { ...defaults, cacheVersion: 2, revision: createHash('sha256').update(JSON.stringify(defaults)).digest('hex').slice(0, 24) };
}
export function publicMapConfig(): PublicMapConfig {
  const { provider, jsKey, webKey, securityCode, baseURL, revision, cache } = readMapConfig();
  const missing = [!jsKey && 'JS API Key', !webKey && 'Web 服务 Key', !securityCode && '安全密钥'].filter(Boolean) as string[];
  return { provider, jsKey, hasWebKey: !!webKey, hasSecurityCode: !!securityCode, baseURL, revision, cacheEpoch: mapCacheEpoch(), cache, ready: !missing.length, missing };
}
export function saveMapConfig(value: Record<string, unknown>) {
  const current = readMapConfig();
  if (value.revision !== current.revision) throw new Error('配置已在其他窗口更新，请重新打开设置');
  if (value.provider !== 'mock' && value.provider !== 'amap') throw new Error('请选择有效地图模式');
  const url = new URL(String(value.baseURL || ''));
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('服务地址需为 HTTPS 或本机 HTTP 地址');
  const baseURL = url.href.replace(/\/+$/, '');
  const secret = (key: 'webKey' | 'securityCode' | 'jsKey') => {
    const raw = value[`clear${key[0].toUpperCase()}${key.slice(1)}`] === true ? '' : typeof value[key] === 'string' && (value[key] as string).trim() ? (value[key] as string).trim() : key === 'webKey' && baseURL !== current.baseURL ? '' : current[key];
    if (raw.length > 4096 || /[\r\n]/.test(raw)) throw new Error('密钥格式无效');
    return raw;
  };
  const policy = value.cache as CachePolicy;
  if (!policy || typeof policy.enabled !== 'boolean' || !Number.isInteger(policy.maxMB) || policy.maxMB < 8 || policy.maxMB > 1024) throw new Error('缓存容量应为 8–1024 MB');
  const ttl = {} as Record<CacheKind, number>;
  for (const kind of Object.keys(defaultCachePolicy.ttl) as CacheKind[]) {
    const n = policy.ttl?.[kind];
    if (!Number.isInteger(n) || n < 1 || n > 43200) throw new Error('分类有效期应为 1–43200 分钟');
    ttl[kind] = n;
  }
  const next: MapConfig = { provider: value.provider, baseURL, jsKey: secret('jsKey'), webKey: secret('webKey'), securityCode: secret('securityCode'), revision: current.revision, cacheVersion: 2, cache: { enabled: policy.enabled, maxMB: policy.maxMB, ttl } };
  const unchanged = next.provider === current.provider && next.baseURL === current.baseURL && next.jsKey === current.jsKey && next.webKey === current.webKey && next.securityCode === current.securityCode && next.cache.enabled === current.cache.enabled && next.cache.maxMB === current.cache.maxMB && (Object.keys(ttl) as CacheKind[]).every(kind => ttl[kind] === current.cache.ttl[kind]);
  if (unchanged && readConfigFile<MapConfig>('map-config.json', ['webKey', 'securityCode'])?.cacheVersion === 2) return publicMapConfig();
  if (!unchanged) next.revision = randomUUID();
  writeConfigFile('map-config.json', next, ['webKey', 'securityCode']);
  return publicMapConfig();
}
