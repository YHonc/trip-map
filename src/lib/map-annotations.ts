import type { Coordinate } from './types';

export const ANNOTATION_COLORS = ['#d97732', '#d34e68', '#6264cf'] as const;
export const MAX_ANNOTATIONS = 80;
export const MAX_ANNOTATION_POINTS = 500;
export type MapAnnotation = { id: string; kind: 'pen' | 'ellipse'; color: string; points: Coordinate[] };
export const annotationKey = (tripId: string, provider: string) => `trip-map-annotations-v1:${provider}:${tripId}`;

export function parseAnnotations(raw: string | null): MapAnnotation[] {
  try {
    if (!raw || raw.length > 2_000_000) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.items)) return [];
    const ids = new Set<string>();
    return data.items.slice(0, MAX_ANNOTATIONS).filter((item: MapAnnotation) => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || !['pen', 'ellipse'].includes(item.kind) || !(ANNOTATION_COLORS as readonly string[]).includes(item.color)) return false;
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > MAX_ANNOTATION_POINTS || (item.kind === 'ellipse' && item.points.length !== 2)) return false;
      if (!item.points.every(p => p && Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng) <= 180 && Math.abs(p.lat) <= 90)) return false;
      ids.add(item.id);
      return true;
    });
  } catch { return []; }
}
export function readAnnotations(tripId: string, provider: string): MapAnnotation[] {
  try { return parseAnnotations(localStorage.getItem(annotationKey(tripId, provider))); } catch { return []; }
}
export function saveAnnotations(tripId: string, provider: string, items: MapAnnotation[]): boolean {
  try {
    const key = annotationKey(tripId, provider);
    if (items.length) localStorage.setItem(key, JSON.stringify({ version: 1, items }));
    else localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
