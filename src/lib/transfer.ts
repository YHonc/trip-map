import { COLORS } from './data';
import type { City, Day, Place, PlannerData, Route, Stop, TravelMode } from './types';

export interface ImportResult {
  data: PlannerData;
  warnings: string[];
}
export function parsePlannerData(text: string): ImportResult {
  if (text.length > 5_000_000) throw new Error('JSON 文件不能超过 5 MB。');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式有误，请检查引号、逗号和括号。');
  }
  return validatePlannerData(value);
}
export function validatePlannerData(value: unknown): ImportResult {
  const warnings = new Set<string>();
  const fail = (path: string, message: string): never => {
    throw new Error(`${path}：${message}`);
  };
  const object = (value: unknown, path: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, '应为对象');
    return value as Record<string, unknown>;
  };
  const string = (value: unknown, path: string, max = 120): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
      return fail(path, `应为 1–${max} 字符的文本`);
    return value.trim();
  };
  const list = (value: unknown, path: string, max: number): unknown[] => {
    if (!Array.isArray(value)) return fail(path, '应为数组');
    if (value.length > max) return fail(path, `最多支持 ${max} 项`);
    return value;
  };
  const id = (value: unknown, path: string) => {
    const result = string(value, path);
    if (
      !/^[\p{L}\p{N}_.:-]+$/u.test(result) ||
      ['__proto__', 'constructor', 'prototype'].includes(result)
    )
      return fail(path, 'ID 只能包含文字、数字、点、短横线、下划线和冒号');
    return result;
  };
  const unique = (value: string, set: Set<string>, path: string) => {
    if (set.has(value)) fail(path, `ID「${value}」重复`);
    set.add(value);
    return value;
  };
  const color = (value: unknown, fallback: string, path: string) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value))
      return fail(path, '颜色应为十六进制格式，例如 #237bff');
    return value;
  };
  const optionalText = (value: unknown, path: string, fallback: string) => {
    if (value === undefined) {
      warnings.add('缺少的地址／分类使用默认显示文本。');
      return fallback;
    }
    if (typeof value !== 'string' || value.length > 500)
      return fail(path, '应为不超过 500 字符的文本');
    return value;
  };
  const place = (value: unknown, path: string): Place => {
    const p = object(value, path);
    const missingCoordinates = p.lng == null || p.lat == null;
    if (p.lng != null && (typeof p.lng !== 'number' || !Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180))
      fail(`${path}.lng`, '经度应为 -180 至 180 的数字');
    if (p.lat != null && (typeof p.lat !== 'number' || !Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90))
      fail(`${path}.lat`, '纬度应为 -90 至 90 的数字');
    if (missingCoordinates) warnings.add('缺少坐标的地点已保留为待确认地点；确认位置前不绘点或计算所在路线。');
    return {
      id: id(p.id, `${path}.id`),
      name: string(p.name, `${path}.name`),
      address: optionalText(p.address, `${path}.address`, ''),
      category: optionalText(p.category, `${path}.category`, '地点'),
      lng: p.lng == null ? null : p.lng as number,
      lat: p.lat == null ? null : p.lat as number,
      ...(p.provider != null ? { provider: (() => {
        if (!['mock', 'amap', 'unknown'].includes(String(p.provider))) fail(path, '未知地图来源');
        return p.provider as Place['provider'];
      })() } : {}),
      ...(p.coordinateSystem != null ? { coordinateSystem: (() => {
        if (!['GCJ-02', 'demo', 'unknown'].includes(String(p.coordinateSystem))) fail(path, '未知坐标系');
        return p.coordinateSystem as Place['coordinateSystem'];
      })() } : {}),
      ...(p.poiId != null ? { poiId: id(p.poiId, `${path}.poiId`) } : {}),
      ...(p.locationSource !== undefined ? { locationSource: (() => {
        if (p.locationSource !== 'map-click' || p.provider !== 'amap' || p.coordinateSystem !== 'GCJ-02') fail(path, '地图选点来源无效');
        return 'map-click' as const;
      })() } : {}),
      ...(p.color !== undefined ? { color: color(p.color, COLORS[0], `${path}.color`) } : {}),
    };
  };
  const source = object(value, '数据');
  const city = (value: unknown, path: string): City => {
    const c = object(value, path);
    if (typeof c.adcode !== 'string' || !/^\d{6}$/.test(c.adcode) || c.provider !== 'amap' || c.coordinateSystem !== 'GCJ-02' || typeof c.lng !== 'number' || !Number.isFinite(c.lng) || Math.abs(c.lng) > 180 || typeof c.lat !== 'number' || !Number.isFinite(c.lat) || Math.abs(c.lat) > 90) return fail(path, '城市信息无效');
    return { name: string(c.name, `${path}.name`), adcode: c.adcode, lng: c.lng, lat: c.lat, provider: 'amap', coordinateSystem: 'GCJ-02' };
  };
  if (source.version !== undefined && source.version !== 2) fail('version', '不支持的版本');
  const trip = object(source.trip, 'trip');
  const dayIds = new Set<string>(),
    routeIds = new Set<string>(),
    stopIds = new Set<string>(),
    favoriteIds = new Set<string>();
  let totalStops = 0;
  const days: Day[] = list(trip.days, 'trip.days', 100).map((value, dayIndex) => {
    const path = `trip.days[${dayIndex}]`,
      d = object(value, path),
      dayColor = color(d.color, COLORS[dayIndex % COLORS.length], `${path}.color`);
    if (d.date != null && typeof d.date !== 'string') fail(`${path}.date`, '应为 YYYY-MM-DD 日期，或留空表示日期待定');
    const date = typeof d.date === 'string' ? d.date.trim() : '';
    if (!date) warnings.add('未填写的日期保留为“日期待定”，可稍后设置。');
    const parsedDate = new Date(`${date}T12:00:00Z`);
    if (
      date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date)
    )
      fail(`${path}.date`, '应为有效的 YYYY-MM-DD 日期');
    const routes: Route[] = list(d.routes, `${path}.routes`, 100).map((value, routeIndex) => {
      const rp = `${path}.routes[${routeIndex}]`,
        r = object(value, rp);
      const mode = r.mode ?? 'driving';
      if (!['driving', 'walking', 'riding'].includes(String(mode)))
        fail(`${rp}.mode`, '只支持 driving、walking、riding');
      if (r.visible !== undefined && typeof r.visible !== 'boolean')
        fail(`${rp}.visible`, '应为 true 或 false');
      const stops: Stop[] = list(r.stops, `${rp}.stops`, 2000).map((value, order) => {
        if (++totalStops > 2000) fail('trip.days', '整个行程最多支持 2000 个地点');
        const sp = `${rp}.stops[${order}]`,
          raw = object(value, sp),
          p = place(raw, sp);
        unique(p.id, stopIds, `${sp}.id`);
        if (raw.order !== order) warnings.add('地点顺序已按数组排列重新编号。');
        if (raw.placeId == null) warnings.add('旧格式地点缺少 placeId，已沿用该地点的 ID。');
        return {
          ...p,
          placeId: raw.placeId == null ? p.id : id(raw.placeId, `${sp}.placeId`),
          order,
        };
      });
      return {
        id: unique(id(r.id, `${rp}.id`), routeIds, `${rp}.id`),
        name: string(r.name, `${rp}.name`),
        mode: mode as TravelMode,
        visible: r.visible === undefined ? true : (r.visible as boolean),
        color: color(r.color, dayColor, `${rp}.color`),
        stops,
        ...(r.city !== undefined ? { city: city(r.city, `${rp}.city`) } : {}),
      };
    });
    return {
      id: unique(id(d.id, `${path}.id`), dayIds, `${path}.id`),
      name: string(d.name, `${path}.name`),
      date,
      color: dayColor,
      routes,
      ...(d.city !== undefined ? { city: city(d.city, `${path}.city`) } : {}),
      ...(d.transfers !== undefined ? { transfers: list(d.transfers, `${path}.transfers`, 10000).map((value, i) => {
        const t = object(value, `${path}.transfers[${i}]`);
        if (typeof t.enabled !== 'boolean' || !['driving', 'walking', 'riding'].includes(String(t.mode))) fail(path, '转场设置无效');
        return { fromRouteId: id(t.fromRouteId, path), toRouteId: id(t.toRouteId, path), enabled: t.enabled as boolean, mode: t.mode as TravelMode };
      }) } : {}),
    };
  });
  const favorites = list(source.favorites, 'favorites', 2000).map((value, index) => {
    const p = place(value, `favorites[${index}]`);
    unique(p.id, favoriteIds, `favorites[${index}].id`);
    return p;
  });
  const data: PlannerData = {
    ...(source.version === 2 ? { version: 2 as const } : {}),
    trip: { id: id(trip.id, 'trip.id'), name: string(trip.name, 'trip.name'), days },
    favorites,
  };
  const dragIds = new Set<string>();
  const register = (id: string) => unique(id, dragIds, '拖拽标识');
  days.forEach((day) => {
    register(`day-drop-${day.id}`);
    day.routes.forEach((route) => {
      register(`route-drop-${route.id}`);
      route.stops.forEach((stop, index) => {
        register(stop.id);
        register(`insert-${route.id}-${index}`);
      });
      register(`insert-${route.id}-${route.stops.length}`);
    });
  });
  favorites.forEach((p) => register(`favorite-${p.id}`));
  return { data, warnings: [...warnings] };
}
export const serializePlannerData = (data: PlannerData) => JSON.stringify(data, null, 2);
