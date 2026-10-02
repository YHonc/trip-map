import { places } from '@/lib/data';
import { Coordinate, Place, RouteGeometry } from '@/lib/types';
import { streetRoute } from '@/lib/street-network';
import { calculateAmapRoute, type RouteSegments } from './amap-routing';
import { RequestCache } from '@/lib/request-cache';
import { recordCache } from '@/lib/debug';
import type { PublicMapConfig } from '@/lib/map-config';
import { mapFetch, configureMapCache, mapCacheNamespace } from './map-request';
const searches = new RequestCache<Place[]>(64, 60_000);
export let mapProvider = 'mock';
export let runtimeMapConfig: PublicMapConfig | undefined;
export type ViewportCommand =
  { type: 'pan'; coordinate: Coordinate; zoom?: number } | { type: 'fit'; coordinates: Coordinate[] };
export interface MapService {
  searchPlace(keyword: string, city?: string): Promise<Place[]>;
  calculateDrivingRoute(stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments): Promise<RouteGeometry>;
  calculateWalkingRoute(stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments): Promise<RouteGeometry>;
  calculateRidingRoute(stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments): Promise<RouteGeometry>;
  calculateSubwayRoute(stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments, city?: string): Promise<RouteGeometry>;
  fitView(coordinates: Coordinate[]): void;
  panTo(coordinate: Coordinate, zoom?: number): void;
  subscribeViewport(listener: (command: ViewportCommand) => void): () => void;
}
export async function mockSearchPlaces(keyword: string): Promise<Place[]> {
  const query = keyword.trim().toLowerCase().replace(/\s+/g, '');
  if (!query) return [];
  if (query.includes('外滩'))
    return ['bund', 'platform', 'origin'].map((id) => places.find((p) => p.id === id)!);
  return places.filter((p) => `${p.name}${p.address}${p.category}`.toLowerCase().includes(query));
}
export function buildMockRoute(stops: Coordinate[], speed = 28): RouteGeometry {
  if (stops.length < 2 || stops.every(p => p.lng === stops[0].lng && p.lat === stops[0].lat))
    return { path: stops.slice(0, 1), paths: [], source: 'mock', distance: 0, duration: 0, legs: stops.slice(1).map(() => ({ distance: 0, duration: 0 })) };
  if (stops.length > 2) {
    const parts = stops.slice(1).map((stop, index) => buildMockRoute([stops[index], stop], speed));
    return { path: parts.flatMap(p => p.path), paths: parts.flatMap(p => p.paths ?? [p.path]), source: 'mock', legs: parts.map(p => ({ distance: p.distance, duration: p.duration })), distance: parts.reduce((sum, p) => sum + p.distance, 0), duration: parts.reduce((sum, p) => sum + p.duration, 0) };
  }
  const path = streetRoute(stops);
  const distance = path
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot((p.lng - path[i].lng) * 95, (p.lat - path[i].lat) * 111),
      0,
    );
  return { path, paths: [path], source: 'mock', distance: distance * 1000, duration: (distance / speed) * 3600, legs: [{ distance: distance * 1000, duration: (distance / speed) * 3600 }] };
}
class MockMapService implements MapService {
  private listeners = new Set<(command: ViewportCommand) => void>();
  searchPlace = mockSearchPlaces;
  private async calculate(stops: Coordinate[], speed: number) {
    await new Promise((resolve) => setTimeout(resolve, 420));
    return buildMockRoute(stops, speed);
  }
  calculateDrivingRoute = (stops: Coordinate[]) => this.calculate(stops, 28);
  calculateWalkingRoute = (stops: Coordinate[]) => this.calculate(stops, 4.5);
  calculateRidingRoute = (stops: Coordinate[]) => this.calculate(stops, 14);
  calculateSubwayRoute = async (_stops: Coordinate[], _isCurrent?: () => boolean, _retained?: RouteSegments, _city?: string): Promise<RouteGeometry> => { throw new Error('地铁规划需要启用高德地图并选择城市'); };
  fitView(coordinates: Coordinate[]) {
    this.listeners.forEach((listener) => listener({ type: 'fit', coordinates }));
  }
  panTo(coordinate: Coordinate, zoom?: number) {
    this.listeners.forEach((listener) => listener({ type: 'pan', coordinate, zoom }));
  }
  subscribeViewport(listener: (command: ViewportCommand) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
class AMapService extends MockMapService {
  searchPlace = async (keyword: string, city?: string): Promise<Place[]> => {
    if (!keyword.trim()) return [];
    return searches.get(JSON.stringify([mapCacheNamespace(), keyword.trim(), city]), async () => {
    const response = await mapFetch(`/api/amap/search?q=${encodeURIComponent(keyword.trim())}${city ? `&city=${encodeURIComponent(city)}` : ''}`, { signal: AbortSignal.timeout(12_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '高德搜索失败');
    return result.places;
    }, status => recordCache('地点搜索', status));
  };
  calculateDrivingRoute = (stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments) => calculateAmapRoute(stops, 'driving', isCurrent, retained);
  calculateWalkingRoute = (stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments) => calculateAmapRoute(stops, 'walking', isCurrent, retained);
  calculateRidingRoute = (stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments) => calculateAmapRoute(stops, 'riding', isCurrent, retained);
  calculateSubwayRoute = (stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments, city?: string) => calculateAmapRoute(stops, 'subway', isCurrent, retained, city);
}
export let mapService: MapService = new MockMapService();
export function configureMap(config: PublicMapConfig) {
  runtimeMapConfig = config;
  configureMapCache(config);
  mapProvider = config.provider;
  mapService = config.provider === 'amap' ? new AMapService() : new MockMapService();
}
