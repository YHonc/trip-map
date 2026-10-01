import type { City } from '@/lib/types';
import { readMapConfig } from './map-config';
import { cachedMap } from './map-cache';
import { checkBudget, waitForAmapSlot } from './amap';
import { markUpstreamRequest } from './request-trace';
export function parseCities(value: unknown): City[] {
  const result = value as { status?: string; districts?: { name: string; adcode: string; center: string; level: string }[] };
  if (result?.status !== '1' || !Array.isArray(result.districts)) throw new Error('高德城市查询失败');
  return result.districts.filter(c => c.level === 'city' || (c.level === 'province' && ['110000', '120000', '310000', '500000'].includes(c.adcode))).flatMap(c => {
    const [lng, lat] = String(c.center).split(',').map(Number);
    return /^\d{6}$/.test(c.adcode) && Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [{ name: c.name, adcode: c.adcode, lng, lat, provider: 'amap' as const, coordinateSystem: 'GCJ-02' as const }] : [];
  });
}
export async function searchCities(keyword: string) {
  const config = readMapConfig();
  const key = config.webKey;
  if (!key) throw new Error('请先配置高德 Web 服务 Key');
  if (!keyword.trim() || keyword.length > 40) throw new Error('请输入城市名称（不超过 40 字）');
  return cachedMap('city', [keyword.trim()], config, async () => {
    checkBudget();
    await waitForAmapSlot();
    const url = new URL(`${config.baseURL}/v3/config/district`);
    url.search = new URLSearchParams({ key, keywords: keyword.trim(), subdistrict: '0', extensions: 'base' }).toString();
    markUpstreamRequest('city');
    const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('城市查询暂不可用');
    return parseCities(await response.json());
  });
}
