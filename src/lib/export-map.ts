import type { Coordinate, PlannerData, RouteResult } from './types';
import { hasCoordinates } from './location';

export const EXPORT_MAP_WIDTH = 1600;
export const EXPORT_MAP_HEIGHT = 850;
export const STATIC_MAP_SIZE = '800*425';
// Static Maps' numbered zoom uses a 512-pixel world base; scale=2 doubles it.
// Keep fitting and overlay projection on this same scale (verified against exported POIs).
export const STATIC_MAP_WORLD_BASE = 1024;
export interface ExportViewport { center: Coordinate; zoom: number }
export interface ExportBasemap extends ExportViewport { dataUrl: string }

export function mercator(point: Coordinate) {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat)) * Math.PI / 180;
  return { x: (point.lng + 180) / 360, y: (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2 };
}
export function exportMapPoint(point: Coordinate, viewport: ExportViewport) {
  const projected = mercator(point), center = mercator(viewport.center);
  const world = STATIC_MAP_WORLD_BASE * 2 ** viewport.zoom;
  return { x: (projected.x - center.x) * world + EXPORT_MAP_WIDTH / 2, y: (projected.y - center.y) * world + EXPORT_MAP_HEIGHT / 2 };
}
export function exportViewport(data: PlannerData, results: Record<string, RouteResult> = {}, transfers: Record<string, RouteResult> = {}): ExportViewport {
  const routes = data.trip.days.flatMap(day => day.routes);
  const geometries = routes.map(route => results[route.id])
    .flatMap(result => result?.status === 'ready' && result.geometry ? [result.geometry] : []);
  const points: Coordinate[] = [...routes.flatMap(route => route.stops).filter(hasCoordinates), ...geometries.flatMap(g => [...(g.paths ?? [g.path]).flat(), ...(g.connectors ?? []).flat()])];
  if (!points.length) {
    const city = data.trip.days.flatMap(day => [day.city, ...day.routes.map(route => route.city)]).find(Boolean);
    return { center: city ? { lng: city.lng, lat: city.lat } : { lng: 104.2, lat: 35.8 }, zoom: city ? 10 : 3 };
  }
  const projected = points.map(mercator);
  const bounds = projected.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const x = (bounds.minX + bounds.maxX) / 2, y = (bounds.minY + bounds.maxY) / 2;
  const center = { lng: Number((x * 360 - 180).toFixed(6)), lat: Number((Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI).toFixed(6)) };
  const zoom = Math.max(1, Math.min(16, Math.floor(Math.log2(Math.min((EXPORT_MAP_WIDTH - 600) / Math.max(1e-8, bounds.maxX - bounds.minX), (EXPORT_MAP_HEIGHT - 180) / Math.max(1e-8, bounds.maxY - bounds.minY)) / STATIC_MAP_WORLD_BASE))));
  return { center, zoom: points.length === 1 ? Math.min(14, zoom) : zoom };
}
