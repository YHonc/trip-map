import type { Day, PlannerData, Route, RouteResult, Stop } from './types';
import { connectedRoutes } from './connected-routes';
import { routingFingerprint } from './routing-fingerprint';

export const STAY_OPTIONS = [15, 30, 45, 60];
export const timeMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function stayMinutes(stop: Pick<Stop, 'stayMinutes' | 'startTime' | 'endTime' | 'endDayOffset'>): number {
  if (Number.isInteger(stop.stayMinutes) && stop.stayMinutes! >= 0 && stop.stayMinutes! <= 1440) return stop.stayMinutes!;
  if (stop.startTime && stop.endTime) {
    const duration = timeMinutes(stop.endTime) + (stop.endDayOffset ?? 0) * 1440 - timeMinutes(stop.startTime);
    if (duration >= 0 && duration <= 1440) return duration;
  }
  return 30;
}
export function departureTime(day: Day): string {
  return day.departureTime || day.startTime || day.routes.flatMap(r => r.stops).flatMap(s => s.startTime ? [s.startTime] : []).sort()[0] || '09:00';
}
export function calculationSignature(data: PlannerData): string {
  return JSON.stringify([data.trip.id, data.trip.days.map(d => [d.id, departureTime(d), connectedRoutes(d).map(r => [r.id, r.visible, routingFingerprint(r.mode, r.stops, r.city?.name), r.stops.map(s => [s.id, stayMinutes(s)])])])]);
}
export type CalculatedVisit = { arrival: number; departure: number };
export function calculatedTime(minutes: number): string {
  const day = Math.floor(minutes / 1440), time = minutes % 1440;
  return `${day === 1 ? '次日 ' : day > 1 ? `第 ${day + 1} 天 ` : ''}${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
}
export function incomingLeg(route: Route, result: RouteResult | undefined, stopId: string) {
  const index = route.stops.findIndex(stop => stop.id === stopId);
  if (index < 1 || result?.status !== 'ready') return undefined;
  return result.geometry?.legs?.[index - 1];
}
/** Local schedule math only. A missing journey makes all following times unknown. */
export function calculateVisits(data: PlannerData, results: Record<string, RouteResult>): Record<string, CalculatedVisit> {
  const visits: Record<string, CalculatedVisit> = {};
  for (const day of data.trip.days) {
    let cursor: number | null = timeMinutes(departureTime(day));
    let previous: string | undefined;
    const journeys = connectedRoutes(day);
    day.routes.forEach((route, routeIndex) => {
      if (!route.visible) return;
      const journey = journeys[routeIndex];
      for (const stop of route.stops) {
        if (previous) {
          const leg = incomingLeg(journey, results[route.id], stop.id);
          if (!leg) cursor = null;
          else if (cursor !== null) cursor += Math.ceil(leg.duration / 60);
        }
        if (cursor !== null) { visits[stop.id] = { arrival: cursor, departure: cursor + stayMinutes(stop) }; cursor += stayMinutes(stop); }
        previous = stop.id;
      }
    });
  }
  return visits;
}
