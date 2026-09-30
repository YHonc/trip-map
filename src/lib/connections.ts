import type { Day, Route, TravelMode } from './types';
export interface Connection { id: string; dayId: string; from: Route; to: Route; mode: TravelMode; enabled: boolean; visible: boolean; }
export function dayConnections(day: Day): Connection[] {
  const routes = day.routes.filter(route => route.stops.length);
  return routes.slice(1).map((to, index) => {
    const from = routes[index];
    const saved = day.transfers?.find(t => t.fromRouteId === from.id && t.toRouteId === to.id);
    return { id: `transfer:${JSON.stringify([day.id, from.id, to.id])}`, dayId: day.id, from, to,
      mode: saved?.mode ?? from.mode, enabled: saved?.enabled ?? true, visible: from.visible && to.visible };
  });
}
