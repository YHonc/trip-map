import { places } from '@/lib/data';
import { Coordinate, Place, RouteGeometry } from '@/lib/types';
import { streetRoute } from '@/lib/street-network';
import { calculateAmapRoute, type RouteSegments } from './amap-routing';
import { RequestCache } from '@/lib/request-cache';
import { recordCache } from '@/lib/debug';
import type { PublicMapConfig } from '@/lib/map-config';
import { mapFetch, setMapRevision } from './map-request';
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
    return { path: stops.slice(0, 1), paths: [], source: 'mock', distance: 0, duration: 0 };
  const path = streetRoute(stops);
  const distance = path
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot((p.lng - path[i].lng) * 95, (p.lat - path[i].lat) * 111),
      0,
    );
  return { path, paths: [path], source: 'mock', distance: distance * 1000, duration: (distance / speed) * 3600 };
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
    return searches.get(JSON.stringify([keyword.trim(), city]), async () => {
    const response = await mapFetch(`/api/amap/search?q=${encodeURIComponent(keyword.trim())}${city ? `&city=${encodeURIComponent(city)}` : ''}`, { signal: AbortSignal.timeout(12_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '高德搜索失败');
    return result.places;
    }, status => recordCache('地点搜索', status));
  };
  calculateDrivingRoute = (stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments) => calculateAmapRoute(stops, 'driving', isCurrent, retained);
  calculateWalkingRoute = (stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments) => calculateAmapRoute(stops, 'walking', isCurrent, retained);
  calculateRidingRoute = (stops: Coordinate[], isCurrent?: () => boolean, retained?: RouteSegments) => calculateAmapRoute(stops, 'riding', isCurrent, retained);
}
export let mapService: MapService = new MockMapService();
export function configureMap(config: PublicMapConfig) {
  runtimeMapConfig = config;
  setMapRevision(config.revision);
  mapProvider = config.provider;
  mapService = config.provider === 'amap' ? new AMapService() : new MockMapService();
}
