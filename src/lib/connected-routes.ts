import type { Day, Route, TravelMode } from './types';

/** Each route also owns the journey into its first place, within the same day. */
export function connectedRoutes(day: Day): Route[] {
  let previous: Route['stops'][number] | undefined;
  return day.routes.map(route => {
    if (!route.visible || !route.stops.length) {
      // Hidden and empty groups do not interrupt the visible itinerary.
      return route;
    }
    const stops = previous ? [previous, ...route.stops] : route.stops;
    previous = route.stops.at(-1);
    return { ...route, city: route.city ?? day.city, stops };
  });
}

/** Split legacy groups only when editing one place's incoming journey. */
export function setIncomingMode(day: Day, routeId: string, stopId: string, mode: TravelMode, newIds: [string, string]): Day {
  return splitStopRoute(day, routeId, stopId, { mode }, newIds);
}
export function setStopVisibility(day: Day, routeId: string, stopId: string, visible: boolean, newIds: [string, string]): Day {
  return splitStopRoute(day, routeId, stopId, { visible }, newIds);
}
function splitStopRoute(day: Day, routeId: string, stopId: string, patch: Partial<Pick<Route, 'mode' | 'visible'>>, newIds: [string, string]): Day {
  return { ...day, routes: day.routes.flatMap(route => {
    const index = route.stops.findIndex(stop => stop.id === stopId);
    if (route.id !== routeId || index < 0 || Object.entries(patch).every(([key, value]) => route[key as keyof Route] === value)) return [route];
    const pieces = [route.stops.slice(0, index), [route.stops[index]], route.stops.slice(index + 1)];
    let nextId = 0, first = true;
    return pieces.flatMap((stops, part) => {
      if (!stops.length) return [];
      const id = first ? route.id : newIds[nextId++];
      const schedule = first ? {} : { startTime: undefined, endTime: undefined, endDayOffset: undefined, notes: undefined };
      first = false;
      return [{ ...route, ...schedule, ...(part === 1 ? patch : {}), id, stops: stops.map((stop, order) => ({ ...stop, order })) }];
    });
  }) };
}
