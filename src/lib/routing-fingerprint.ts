import { isVerifiedPlace } from './location';
import type { Place, TravelMode } from './types';
/** UI names, ordering labels and business IDs do not change road geometry. */
export const routingFingerprint = (mode: TravelMode, stops: Place[], city?: string) => JSON.stringify([mode, stops.map(s => [s.lng, s.lat, isVerifiedPlace(s)]), ...(mode === 'subway' ? [city ?? ''] : [])]);
