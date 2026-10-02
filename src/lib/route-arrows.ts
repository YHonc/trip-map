type Point = { x: number; y: number };
/** Sample by distance, so short geometry steps do not pile up arrowheads. */
export function routeArrows(points: Point[], spacing = 80) {
  if (spacing <= 0 || !Number.isFinite(spacing)) return [];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 16) return [];
  const count = Math.min(500, Math.max(1, Math.floor(total / spacing)));
  const arrows: (Point & { angle: number })[] = [];
  let segment = 0, passed = 0;
  for (let index = 0; index < count; index++) {
    const distance = total * (index + .5) / count;
    while (segment < lengths.length - 1 && passed + lengths[segment] < distance) passed += lengths[segment++];
    const length = lengths[segment];
    if (!length) continue;
    const a = points[segment], b = points[segment + 1], ratio = (distance - passed) / length;
    arrows.push({ x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI });
  }
  return arrows;
}
