import { dayConnections } from '@/lib/connections';
import { isVerifiedPlace } from '@/lib/location';
import type { Day, Route, RouteGeometry } from '@/lib/types';
import { mapProvider, mapService } from './map-service';

export async function optimizationCost(day: Day, selected: string[], isCurrent: () => boolean) {
  const calculate = async (route: Pick<Route, 'mode' | 'stops'>): Promise<RouteGeometry> => {
    if (!isCurrent()) throw new Error('候选已失效');
    if (mapProvider !== 'amap' || route.stops.some(s => !isVerifiedPlace(s))) throw new Error('请先启用高德模式，并确认所选路线及相邻转场的地点');
    return ({ driving: mapService.calculateDrivingRoute, walking: mapService.calculateWalkingRoute, riding: mapService.calculateRidingRoute })[route.mode](route.stops, isCurrent);
  };
  let distance = 0, duration = 0, transferDistance = 0, transferDuration = 0;
  for (const route of day.routes.filter(r => selected.includes(r.id))) {
    const geometry = await calculate(route); distance += geometry.distance; duration += geometry.duration;
  }
  for (const connection of dayConnections(day).filter(c => c.enabled && (selected.includes(c.from.id) || selected.includes(c.to.id)))) {
    const geometry = await calculate({ mode: connection.mode, stops: [connection.from.stops.at(-1)!, connection.to.stops[0]] });
    transferDistance += geometry.distance; transferDuration += geometry.duration;
  }
  return { distance: distance + transferDistance, duration: duration + transferDuration, transferDistance, transferDuration };
}
export type OptimizationCost = Awaited<ReturnType<typeof optimizationCost>>;
