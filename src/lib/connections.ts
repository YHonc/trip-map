import type { Day, Route, Schedule, TravelMode } from './types';
export interface Connection extends Schedule { id: string; dayId: string; from: Route; to: Route; mode: TravelMode; enabled: boolean; visible: boolean; }
/** Compatibility for old callers: separate routes never imply a connection. */
export function dayConnections(_day: Day): Connection[] {
  return [];
}
