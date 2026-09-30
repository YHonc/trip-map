import type { City, Day, PlannerData, Selection } from './types';
export const effectiveCity = (day: Day | undefined, routeId?: string | null) => day?.routes.find(r => r.id === routeId)?.city ?? day?.city;
export const selectedCity = (data: PlannerData, selection: Selection) => effectiveCity(data.trip.days.find(d => d.id === selection.activeDayId), selection.activeRouteId);
export function setCity(data: PlannerData, dayId: string, routeId: string | undefined, city: City | undefined): PlannerData {
  return { ...data, trip: { ...data.trip, days: data.trip.days.map(day => day.id !== dayId ? day : routeId ? { ...day, routes: day.routes.map(route => route.id === routeId ? { ...route, city } : route) } : { ...day, city }) } };
}
