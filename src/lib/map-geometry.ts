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
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const shift = (rect: Rect, delta: Point): Rect => ({
  ...rect,
  x: rect.x + delta.x,
  y: rect.y + delta.y,
});
/** The smallest translation that fits the popup + marker. Already-visible points stay fixed. */
export function minimumPan(rect: Rect, bounds: Rect, obstacles: Rect[] = []): Point {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  let result = {
    x: clamp(rect.x, bounds.x, bounds.x + Math.max(0, bounds.width - rect.width)) - rect.x,
    y: clamp(rect.y, bounds.y, bounds.y + Math.max(0, bounds.height - rect.height)) - rect.y,
  };
  for (const obstacle of obstacles) {
    const current = shift(rect, result);
    if (!overlaps(current, obstacle)) continue;
    const candidates = [
      { x: obstacle.x - current.x - current.width - 10, y: 0 },
      { x: obstacle.x + obstacle.width - current.x + 10, y: 0 },
      { x: 0, y: obstacle.y - current.y - current.height - 10 },
      { x: 0, y: obstacle.y + obstacle.height - current.y + 10 },
    ].filter((delta) => {
      const moved = shift(current, delta);
      return (
        moved.x >= bounds.x &&
        moved.y >= bounds.y &&
        moved.x + moved.width <= bounds.x + bounds.width &&
        moved.y + moved.height <= bounds.y + bounds.height &&
        !obstacles.some((other) => overlaps(moved, other))
      );
    });
    candidates.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    if (candidates[0]) result = { x: result.x + candidates[0].x, y: result.y + candidates[0].y };
  }
  return result;
}
