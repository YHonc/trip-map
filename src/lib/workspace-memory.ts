import type { Coordinate, PlannerData, Selection } from './types';
import { selectedCity } from './city';
import { isVerifiedPlace } from './location';

export type WorkspaceMemory = { selection: Selection; center?: Coordinate; zoom?: number };
const key = (id: string) => `trip-map-workspace-v1:${id}`;
export function restoreSelection(data: PlannerData, saved?: Selection): Selection {
  const day = data.trip.days.find(day => day.id === saved?.activeDayId) ?? data.trip.days[0];
  const route = day?.routes.find(route => route.id === saved?.activeRouteId);
  return { activeDayId: day?.id ?? null, activeRouteId: route?.id ?? null, activeStopId: null };
}
export function readWorkspaceMemory(id: string): WorkspaceMemory | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key(id)) ?? 'null');
    if (!value || typeof value.selection !== 'object' || !value.selection) return;
    const center = value.center;
    return { selection: value.selection,
      ...(center && typeof center.lng === 'number' && typeof center.lat === 'number' && Number.isFinite(center.lng) && Number.isFinite(center.lat) && Math.abs(center.lng) <= 180 && Math.abs(center.lat) <= 90 ? { center } : {}),
      ...(typeof value.zoom === 'number' && Number.isFinite(value.zoom) && value.zoom >= 3 && value.zoom <= 20 ? { zoom: value.zoom } : {}),
    };
  } catch { return; }
}
export function writeWorkspaceMemory(id: string, patch: Partial<WorkspaceMemory>) {
  try { localStorage.setItem(key(id), JSON.stringify({ ...readWorkspaceMemory(id), ...patch })); } catch { /* Browsing remains available if storage is blocked. */ }
}
export function initialViewport(data: PlannerData, selection: Selection, memory?: WorkspaceMemory) {
  if (memory?.center) return { center: memory.center, zoom: memory.zoom ?? 12 };
  const city = selectedCity(data, selection) ?? data.trip.days.flatMap(day => [day.city, ...day.routes.map(route => route.city)]).find(Boolean);
  if (city) return { center: { lng: city.lng, lat: city.lat }, zoom: 11 };
  const place = data.trip.days.flatMap(day => day.routes.flatMap(route => route.stops)).find(isVerifiedPlace) ?? data.favorites.find(isVerifiedPlace);
  if (place) return { center: { lng: place.lng, lat: place.lat }, zoom: 12 };
  return { center: { lng: 104.2, lat: 35.8 }, zoom: 4 };
}
