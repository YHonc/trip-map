import type { Place, PlannerData } from './types';

export const isVerifiedPlace = (place: Place) =>
  place.provider === 'amap' && place.coordinateSystem === 'GCJ-02' && !!place.poiId;

/** Numeric validity is not provenance. Legacy coordinates always require user confirmation. */
export function migrateData(data: PlannerData): PlannerData {
  const place = <T extends Place>(p: T): T => ({
    ...p,
    provider: p.provider ?? 'unknown',
    coordinateSystem: p.coordinateSystem ?? 'unknown',
  });
  return {
    ...data, version: 2,
    favorites: data.favorites.map(place),
    trip: { ...data.trip, days: data.trip.days.map(day => ({
      ...day, routes: day.routes.map(route => ({ ...route, stops: route.stops.map(place) })),
    })) },
  };
}
