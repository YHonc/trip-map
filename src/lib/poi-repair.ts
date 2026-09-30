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
    return place ? { ...place, id: stop.id, placeId: place.id, order: stop.order } : stop;
  }) })) })) } };
}
