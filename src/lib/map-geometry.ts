import type { Coordinate } from './types';

export interface Point {
  x: number;
  y: number;
}
export interface Camera extends Point {
  scale: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Point, Size {}
export const project = (point: Coordinate): Point => ({
  x: ((point.lng - 121.4) / 0.17) * 1200,
  y: ((31.28 - point.lat) / 0.09) * 880,
});
export const viewportScale = (size: Size) => Math.max(size.width / 1200, size.height / 880);
export function toScreen(point: Coordinate, camera: Camera, size: Size): Point {
  const position = project(point),
    scale = viewportScale(size);
  return {
    x: (position.x * camera.scale + camera.x) * scale + (size.width - 1200 * scale) / 2,
    y: (position.y * camera.scale + camera.y) * scale + (size.height - 880 * scale) / 2,
  };
}
export function fromScreen(point: Point, camera: Camera, size: Size): Coordinate {
  const scale = viewportScale(size);
  const x = ((point.x - (size.width - 1200 * scale) / 2) / scale - camera.x) / camera.scale;
  const y = ((point.y - (size.height - 880 * scale) / 2) / scale - camera.y) / camera.scale;
  return { lng: 121.4 + x / 1200 * .17, lat: 31.28 - y / 880 * .09 };
}
const shift = (rect: Rect, delta: Point): Rect => ({
  ...rect,
  x: rect.x + delta.x,
  y: rect.y + delta.y,
});
/** The smallest translation that fits the popup + marker. Already-visible points stay fixed. */
export function minimumPan(rect: Rect, bounds: Rect, obstacles: Rect[] = []): Point {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const maxX = bounds.x + Math.max(0, bounds.width - rect.width);
  const maxY = bounds.y + Math.max(0, bounds.height - rect.height);
  const xs = new Set([clamp(rect.x, bounds.x, maxX), bounds.x, maxX, ...obstacles.flatMap(o => [o.x - rect.width - 10, o.x + o.width + 10]).map(x => clamp(x, bounds.x, maxX))]);
  const ys = new Set([clamp(rect.y, bounds.y, maxY), bounds.y, maxY, ...obstacles.flatMap(o => [o.y - rect.height - 10, o.y + o.height + 10]).map(y => clamp(y, bounds.y, maxY))]);
  const candidates = [...xs].flatMap(x => [...ys].map(y => ({ x: x - rect.x, y: y - rect.y })));
  const covered = (delta: Point) => {
    const moved = shift(rect, delta);
    return obstacles.reduce((area, o) => area + Math.max(0, Math.min(moved.x + moved.width, o.x + o.width) - Math.max(moved.x, o.x)) * Math.max(0, Math.min(moved.y + moved.height, o.y + o.height) - Math.max(moved.y, o.y)), 0);
  };
  candidates.sort((a, b) => covered(a) - covered(b) || (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
  return candidates[0] ?? { x: 0, y: 0 };
}

/** Largest free height for a popup of this width, including its marker below. */
export function popupMaxHeight(width: number, bounds: Rect, obstacles: Rect[], markerGap: number): number {
  const xs = [bounds.x, bounds.x + bounds.width - width, ...obstacles.flatMap(o => [o.x - width - 10, o.x + o.width + 10])];
  let best = 0;
  for (const x of xs.filter(x => x >= bounds.x && x + width <= bounds.x + bounds.width)) {
    const intervals = obstacles.filter(o => o.x < x + width && o.x + o.width > x).map(o => [Math.max(bounds.y, o.y - 10), Math.min(bounds.y + bounds.height, o.y + o.height)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let start = bounds.y;
    for (const [a, b] of intervals) { best = Math.max(best, a - start); start = Math.max(start, b); }
    best = Math.max(best, bounds.y + bounds.height - start);
  }
  return Math.max(80, best - markerGap);
}
