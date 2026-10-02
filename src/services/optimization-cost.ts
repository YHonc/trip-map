import { isVerifiedPlace } from '@/lib/location';
import type { Day, Route, RouteGeometry } from '@/lib/types';
import { mapProvider, mapService } from './map-service';
import { connectedRoutes } from '@/lib/connected-routes';

export async function optimizationCost(day: Day, selected: string[], isCurrent: () => boolean) {
  const calculate = async (route: Pick<Route, 'mode' | 'stops' | 'city'>): Promise<RouteGeometry> => {
    if (!isCurrent()) throw new Error('候选已失效');
    if (mapProvider !== 'amap' || !route.stops.every(isVerifiedPlace)) throw new Error('请先启用高德模式，并确认所选路线的地点');
    return ({ driving: mapService.calculateDrivingRoute, walking: mapService.calculateWalkingRoute, riding: mapService.calculateRidingRoute, subway: mapService.calculateSubwayRoute })[route.mode](route.stops, isCurrent, undefined, (route.city ?? day.city)?.name);
  };
  let distance = 0, duration = 0;
  for (const route of connectedRoutes(day).filter(r => r.visible && selected.includes(r.id))) {
    const geometry = await calculate(route); distance += geometry.distance; duration += geometry.duration;
  }
  return { distance, duration };
}
export type OptimizationCost = Awaited<ReturnType<typeof optimizationCost>>;
