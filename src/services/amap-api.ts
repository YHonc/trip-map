import type { Place, Coordinate, RouteGeometry, TravelMode } from '@/lib/types';

export function parseAmapRoute(value: unknown, mode: TravelMode, origin: Coordinate, destination: Coordinate): RouteGeometry {
  if (mode === 'subway') return parseSubwayRoute(value, origin, destination);
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

/** Only subway legs and their walking access/transfer legs may be labelled 地铁. */
function parseSubwayRoute(value: unknown, origin: Coordinate, destination: Coordinate): RouteGeometry {
  type Line = { type?: string; distance?: unknown; polyline?: string };
  type Segment = { walking?: { distance?: unknown; steps?: { polyline?: string }[] }; bus?: { buslines?: Line[] }; railway?: Record<string, unknown>; taxi?: Record<string, unknown> };
  const data = value as { status?: string; infocode?: string; route?: { transits?: { duration?: unknown; segments?: Segment[] }[] } };
  if (data?.status !== '1') throw new Error(`高德规划失败（${data?.infocode ?? '未知错误'}）`);
  const candidates: RouteGeometry[] = [];
  for (const transit of data.route?.transits ?? []) {
    try {
      if (!Array.isArray(transit.segments) || !transit.segments.length) continue;
      let distance = 0, subwayLegs = 0;
      const steps: { polyline?: string }[] = [];
      const meters = (v: unknown) => { if ((typeof v !== 'string' && typeof v !== 'number') || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) throw new Error('invalid distance'); return Number(v); };
      for (const segment of transit.segments) {
        if (Object.keys(segment.railway ?? {}).length || Object.keys(segment.taxi ?? {}).length) throw new Error('not subway');
        const walking = segment.walking;
        if (walking && Object.keys(walking).length) {
          const length = meters(walking.distance);
          if (length > 0 && !walking.steps?.some(step => step.polyline)) throw new Error('missing walking path');
          distance += length; steps.push(...(walking.steps ?? []));
        }
        const lines = segment.bus?.buslines ?? [];
        if (lines.length) {
          const line = lines.find(line => line.type === '地铁线路');
          if (!line?.polyline) throw new Error('not subway');
          subwayLegs++; distance += meters(line.distance); steps.push({ polyline: line.polyline });
        }
      }
      if (!subwayLegs) continue;
      const duration = meters(transit.duration);
      candidates.push(parseAmapRoute({ status: '1', route: { paths: [{ distance, duration, steps }] } }, 'walking', origin, destination));
    } catch { /* Skip incomplete routes and routes that require buses or trains. */ }
  }
  const best = candidates.sort((a, b) => a.duration - b.duration)[0];
  if (!best) throw new Error('未找到可用的地铁路线（含步行接驳），请检查城市或选择其他交通方式');
  return best;
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
