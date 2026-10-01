import type { Coordinate, Place, PlannerData } from './types';

export function hasCoordinates<T extends { lng: unknown; lat: unknown }>(place: T): place is T & Coordinate {
  return typeof place.lng === 'number' && Number.isFinite(place.lng) && Math.abs(place.lng) <= 180 && typeof place.lat === 'number' && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90;
}
export const isVerifiedPlace = <T extends Place>(place: T): place is T & Coordinate =>
  hasCoordinates(place) && place.provider === 'amap' && place.coordinateSystem === 'GCJ-02' && (!!place.poiId || place.locationSource === 'map-click');

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
