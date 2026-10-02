export type TravelMode = 'driving' | 'walking' | 'riding' | 'subway';
export interface Coordinate {
  lng: number;
  lat: number;
}
export interface Place {
  /** null means the itinerary place has not been located yet. */
  lng: number | null;
  lat: number | null;
  provider?: 'mock' | 'amap' | 'unknown';
  coordinateSystem?: 'GCJ-02' | 'demo' | 'unknown';
  poiId?: string;
  locationSource?: 'map-click';
  id: string;
  name: string;
  address: string;
  category: string;
  color?: string;
}
export interface Schedule {
  startTime?: string;
  endTime?: string;
  /** End is on the following day; never inferred from a backwards time range. */
  endDayOffset?: 0 | 1;
  notes?: string;
}
export interface Transfer extends Schedule {
  fromRouteId: string;
  toRouteId: string;
  enabled: boolean;
  mode: TravelMode;
}
export interface Stop extends Place, Schedule {
  stayMinutes?: number;
  placeId: string;
  order: number;
}
export interface City extends Coordinate {
  name: string;
  adcode: string;
  provider: 'amap';
  coordinateSystem: 'GCJ-02';
}
export interface Route extends Schedule {
  city?: City;
  id: string;
  name: string;
  mode: TravelMode;
  visible: boolean;
  color: string;
  stops: Stop[];
}
export interface Day extends Schedule {
  departureTime?: string;
  city?: City;
  /** Legacy input only. Normalized into notes on import; never routed. */
  transfers?: Transfer[];
  id: string;
  name: string;
  date: string;
  color: string;
  routes: Route[];
}
export interface Trip {
  id: string;
  name: string;
  days: Day[];
}
export interface PlannerData {
  version?: 2;
  trip: Trip;
  favorites: Place[];
}
export interface Selection {
  activeDayId: string | null;
  activeRouteId: string | null;
  activeStopId: string | null;
}
export interface RouteGeometry {
  /** One entry per adjacent stop pair, including zero-length journeys. */
  legs?: { distance: number; duration: number }[];
  calculatedAt?: number;
  expiresAt?: number;
  source?: 'mock' | 'amap';
  /** Separate road polylines: never imply a verified road between disconnected steps. */
  paths?: Coordinate[][];
  connectors?: Coordinate[][];
  path: Coordinate[];
  /** Metres and seconds, across all adapters. */
  distance: number;
  duration: number;
}
export interface RouteResult {
  error?: string;
  status: 'loading' | 'ready' | 'error';
  geometry?: RouteGeometry;
}
export type DragData =
  | { type: 'favorite'; place: Place }
  | { type: 'stop'; place: Stop; dayId: string; routeId: string };
export type DropData =
  | { type: 'day'; dayId: string }
  | { type: 'route'; dayId: string; routeId: string }
  | { type: 'insertion'; dayId: string; routeId: string; index: number }
  | { type: 'stop'; dayId: string; routeId: string; index: number };
