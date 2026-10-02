import type { Place, PlannerData, Stop } from './types';

const placeId = (place: Place) => 'placeId' in place ? String(place.placeId) : place.id;
export const samePlace = (a: Place, b: Place) => placeId(a) === placeId(b) || (!!a.poiId && a.provider === b.provider && a.poiId === b.poiId);
export function favoriteFromStop(stop: Stop): Place {
  const { placeId: id, order: _order, stayMinutes: _stay, startTime: _start, endTime: _end, endDayOffset: _offset, notes: _notes, ...place } = stop;
  return { ...place, id };
}
export function favoriteDay(data: PlannerData, dayId: string): PlannerData {
  const day = data.trip.days.find(day => day.id === dayId);
  if (!day) return data;
  const favorites = [...data.favorites];
  for (const stop of day.routes.flatMap(route => route.stops)) {
    if (!favorites.some(place => samePlace(place, stop))) favorites.push(favoriteFromStop(stop));
  }
  if (favorites.length > 2000) throw new Error('收藏最多保留 2000 个地点，请先整理收藏');
  return favorites.length === data.favorites.length ? data : { ...data, favorites };
}
