import type { Coordinate, Place } from './types';
/** Keep the clicked coordinate; nearby POIs must never silently replace it. */
export function mapPickedPlace(point: Coordinate, name?: string, poiId?: string): Place {
  if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat) || Math.abs(point.lng) > 180 || Math.abs(point.lat) > 90) throw new Error('地图坐标无效');
  const lng = Number(point.lng.toFixed(6)), lat = Number(point.lat.toFixed(6));
  return { id: poiId ? `amap:${poiId}` : `amap:point:${lng}:${lat}`, ...(poiId ? { poiId } : {}),
    lng, lat, name: name || '地图选点', address: `${lng.toFixed(6)}, ${lat.toFixed(6)}`,
    category: poiId ? '地图地点' : '自选位置', provider: 'amap', coordinateSystem: 'GCJ-02', locationSource: 'map-click' };
}
export function parseAmapAddress(value: unknown): string {
  const data = value as { status?: string; infocode?: string; regeocode?: { formatted_address?: unknown } };
  if (data?.status !== '1') throw new Error(`地址查询失败（${data?.infocode ?? '未知错误'}）`);
  const address = data.regeocode?.formatted_address;
  if (typeof address !== 'string' || !address.trim()) throw new Error('此位置暂无详细地址');
  return address;
}
