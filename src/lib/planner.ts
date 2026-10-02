import { asStop, makeId } from './data';
import { Day, Place, PlannerData, Route, Stop, TravelMode } from './types';
// Hidden routes keep their numbers so toggling visibility never renumbers the day.
export function dayStopOffset(day: Day, routeId: string): number {
  let offset = 0;
  for (const route of day.routes) {
    if (route.id === routeId) return offset;
    offset += route.stops.length;
  }
  return offset;
}
export const normalize = (stops: Stop[]) => stops.map((stop, order) => ({ ...stop, order }));
export function updateRoute(
  data: PlannerData,
  routeId: string,
  update: (route: Route) => Route,
): PlannerData {
  return {
    ...data,
    trip: {
      ...data.trip,
      days: data.trip.days.map((day) => ({
        ...day,
        routes: day.routes.map((route) => (route.id === routeId ? update(route) : route)),
      })),
    },
  };
}
export function insertPlace(
  data: PlannerData,
  routeId: string,
  place: Place,
  index?: number,
  stayMinutes = 30,
): PlannerData {
  return updateRoute(data, routeId, (route) => {
    const stops = [...route.stops];
    stops.splice(index ?? stops.length, 0, { ...asStop(place, 0), stayMinutes });
    return { ...route, stops: normalize(stops) };
  });
}
export function moveStop(
  data: PlannerData,
  sourceId: string,
  targetId: string,
  stopId: string,
  index: number,
): PlannerData {
  const source = data.trip.days.flatMap((d) => d.routes).find((r) => r.id === sourceId);
  const oldIndex = source?.stops.findIndex((s) => s.id === stopId) ?? -1;
  if (
    !source ||
    oldIndex < 0 ||
    !data.trip.days.some((d) => d.routes.some((r) => r.id === targetId))
  )
    return data;
  const stop = source.stops[oldIndex];
  let result = updateRoute(data, sourceId, (route) => ({
    ...route,
    stops: normalize(route.stops.filter((s) => s.id !== stopId)),
  }));
  result = updateRoute(result, targetId, (route) => {
    const stops = [...route.stops];
    const adjusted = sourceId === targetId && oldIndex < index ? index - 1 : index;
    stops.splice(Math.max(0, Math.min(adjusted, stops.length)), 0, stop);
    return { ...route, stops: normalize(stops) };
  });
  return result;
}
export function newRoute(color: string, name = '默认路线'): Route {
  return {
    id: makeId('route'),
    name,
    color,
    mode: 'driving' as TravelMode,
    visible: true,
    stops: [],
  };
}
export function reorder<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
