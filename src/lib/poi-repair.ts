import type { City, Place, PlannerData, Stop } from './types';
import { isVerifiedPlace } from './location';
export type RepairGroup = { key: string; stop: Stop; stopIds: string[]; city?: City };
export function repairGroups(data: PlannerData): RepairGroup[] {
  const groups = new Map<string, RepairGroup>();
  for (const day of data.trip.days) for (const route of day.routes) for (const stop of route.stops) {
    if (isVerifiedPlace(stop)) continue;
    const city = route.city ?? day.city;
    const key = JSON.stringify([stop.name, stop.address, city?.adcode]);
    const group = groups.get(key);
    if (group) group.stopIds.push(stop.id);
    else groups.set(key, { key, stop, stopIds: [stop.id], city });
  }
  return [...groups.values()];
}
export function applyRepairs(data: PlannerData, expected: string, groups: RepairGroup[], choices: Record<string, Place>): PlannerData {
  if (JSON.stringify(data) !== expected) throw new Error('行程已修改，请重新搜索确认');
  const selected = new Map(groups.flatMap(g => choices[g.key] && isVerifiedPlace(choices[g.key]) ? g.stopIds.map(id => [id, choices[g.key]] as const) : []));
  const favorites = data.favorites.map(favorite => {
    if (isVerifiedPlace(favorite)) return favorite;
    const group = groups.find(g => choices[g.key] && isVerifiedPlace(choices[g.key]) && (g.stop.placeId === favorite.id || (g.stop.name === favorite.name && g.stop.address === favorite.address)));
    return group ? choices[group.key] : favorite;
  });
  return { ...data, favorites: [...new Map(favorites.map(f => [f.id, f])).values()], trip: { ...data.trip, days: data.trip.days.map(day => ({ ...day, routes: day.routes.map(route => ({ ...route, stops: route.stops.map(stop => {
    const place = selected.get(stop.id);
    return place ? { ...place, stayMinutes: stop.stayMinutes, startTime: stop.startTime, endTime: stop.endTime, endDayOffset: stop.endDayOffset, notes: stop.notes, id: stop.id, placeId: place.id, order: stop.order } : stop;
  }) })) })) } };
}

const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[\s·,，。()（）-]/g, '');
export function placeSearchQuery(place: Pick<Place, 'name' | 'address'>) {
  const full = [place.name, place.address].filter(Boolean).join(' ');
  return full.length <= 100 ? full : place.name.slice(0, 100);
}
/** Auto-selection needs a unique exact name plus address evidence or a scoped city. */
export function matchingPlace(group: RepairGroup, candidates: Place[]): Place | undefined {
  const name = normalized(group.stop.name), address = normalized(group.stop.address);
  const exact = [...new Map(candidates.filter(p => isVerifiedPlace(p) && p.poiId && normalized(p.name) === name).map(p => [p.poiId, p])).values()];
  const matches = exact.filter(p => {
    if (!address) return !!group.city;
    const found = normalized(p.address);
    return found === address || (address.length >= 6 && found.includes(address));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export async function batchMatchPlaces(data: PlannerData, search: (query: string, city?: string) => Promise<Place[]>, isCurrent: () => boolean, progress: (done: number, total: number) => void = () => {}) {
  const groups = repairGroups(data), choices: Record<string, Place> = {}, errors: string[] = [];
  const check = () => { if (!isCurrent()) throw new Error('匹配已取消'); };
  let done = 0;
  // A bounded pool avoids overwhelming the map service for large imports.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, groups.length) }, async () => {
    while (cursor < groups.length) {
      check();
      const group = groups[cursor++];
      try {
        let places = await search(placeSearchQuery(group.stop), group.city?.adcode);
        check();
        if (!places.length && group.stop.address) places = await search(group.stop.name.slice(0, 100), group.city?.adcode);
        check();
        const matched = matchingPlace(group, places);
        if (matched) choices[group.key] = matched;
      } catch (error) { check(); errors.push(`${group.stop.name}：${error instanceof Error ? error.message : '搜索失败'}`); }
      progress(++done, groups.length);
    }
  }));
  check();
  const matched = groups.reduce((sum, group) => sum + (choices[group.key] ? group.stopIds.length : 0), 0);
  return { data: applyRepairs(data, JSON.stringify(data), groups, choices), matched, remaining: groups.reduce((n, g) => n + g.stopIds.length, 0) - matched, errors };
}
