import type { MapAnnotation } from './map-annotations';
import type { Coordinate } from './types';
import type { Point } from './map-geometry';

export type AnnotationTool = 'pen' | 'ellipse' | 'erase' | 'pan';
export const annotationAction = (button: number, tool: AnnotationTool): AnnotationTool | null =>
  button === 2 ? 'pan' : button === 1 ? 'erase' : button === 0 ? tool : null;

const distance = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function segmentsNear(a: Point, b: Point, c: Point, d: Point, radius: number) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
  return Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b)) <= radius;
}
/** Test the swept eraser against strokes, including fast moves between pointer events. */
export function annotationHit(item: MapAnnotation, from: Point, to: Point, project: (coordinate: Coordinate) => Point, radius = 10): boolean {
  let points = item.points.map(project);
  if (points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  if (item.kind === 'ellipse') {
    const [a, b] = points, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    const count = Math.min(512, Math.max(64, Math.ceil(Math.PI * Math.max(rx, ry) / 4)));
    points = Array.from({ length: count + 1 }, (_, i) => ({ x: cx + rx * Math.cos(i * 2 * Math.PI / count), y: cy + ry * Math.sin(i * 2 * Math.PI / count) }));
  }
  return points.slice(1).some((point, index) => segmentsNear(from, to, points[index], point, radius));
}
