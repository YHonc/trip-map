import type { Place, Coordinate, RouteGeometry, TravelMode } from '@/lib/types';

export function parseAmapRoute(value: unknown, mode: TravelMode, origin: Coordinate, destination: Coordinate): RouteGeometry {
  const data = value as { status?: string; errcode?: number; infocode?: string; route?: { paths?: unknown[] }; data?: { paths?: unknown[] } };
  if (mode === 'riding' ? data.errcode !== 0 : data.status !== '1')
    throw new Error(`高德规划失败（${data.infocode ?? data.errcode ?? '未知错误'}）`);
  const route = (mode === 'riding' ? data.data : data.route)?.paths?.[0] as { distance?: unknown; duration?: unknown; steps?: { polyline?: string }[] } | undefined;
  if (!route) throw new Error('未找到可达路线，请检查地点或更换交通方式');
  const distance = Number(route.distance), duration = Number(route.duration);
  if (route.distance === undefined || route.duration === undefined || !Number.isFinite(distance) || !Number.isFinite(duration) || distance < 0 || duration < 0)
    throw new Error('高德返回的距离或时长无效');
  const paths = (route.steps ?? []).map(step => (step.polyline ?? '').split(';').filter(Boolean).map(pair => {
    const parts = pair.split(',');
    const [lng, lat] = parts.map(Number);
    if (parts.length !== 2 || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) throw new Error('高德路线坐标无效');
    return { lng, lat };
  })).filter(path => path.length > 1);
  if (!paths.length) throw new Error('高德未返回道路几何');
  const path = paths.flat();
  const connectors: Coordinate[][] = [];
  const join = (a: Coordinate, b: Coordinate) => { if (Math.abs(a.lng - b.lng) + Math.abs(a.lat - b.lat) > 0.00001) connectors.push([a, b]); };
  join(origin, path[0]); join(path.at(-1)!, destination);
  paths.slice(1).forEach((p, i) => join(paths[i].at(-1)!, p[0]));
  return { source: 'amap', path, paths, connectors, distance, duration };
}

export function parseAmapPlaces(value: unknown): Place[] {
  const data = value as { status?: string; infocode?: string; pois?: Record<string, unknown>[] };
  if (data.status !== '1') throw new Error(`高德搜索失败（${data.infocode ?? '未知错误'}）`);
  if (!Array.isArray(data.pois)) throw new Error('高德搜索响应格式错误');
  return data.pois.flatMap(poi => {
    if (typeof poi.id !== 'string' || typeof poi.name !== 'string' || typeof poi.location !== 'string') return [];
    const [lng, lat] = poi.location.split(',').map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return [];
    return [{ id: `amap:${poi.id}`, poiId: poi.id, name: poi.name,
      address: [...new Set([poi.pname, poi.cityname, poi.adname, poi.address].filter(v => typeof v === 'string'))].join(''),
      category: typeof poi.type === 'string' ? poi.type.split(';').at(-1)! : '地点',
      lng, lat, provider: 'amap' as const, coordinateSystem: 'GCJ-02' as const }];
  });
}
