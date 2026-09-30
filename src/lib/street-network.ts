import { project, type Point } from './map-geometry';
import type { Coordinate } from './types';

// Shared by the illustrative basemap and router. These are not real navigation roads.
type Street = { a: Point; b: Point; kind: 'street' | 'arterial' | 'bridge' };
const point = (x: number, y: number): Point => ({ x, y });
const rotate = ({ x, y }: Point): Point => {
  const angle = -23 * Math.PI / 180;
  return point(600 + (x - 600) * Math.cos(angle) - (y - 440) * Math.sin(angle),
    440 + (x - 600) * Math.sin(angle) + (y - 440) * Math.cos(angle));
};
const lines = (points: number[][], kind: Street['kind']): Street[] => points.slice(1).map((p, i) => ({
  a: point(...points[i] as [number, number]), b: point(...p as [number, number]), kind,
}));
export const streets: Street[] = [
  ...Array.from({ length: 16 }, (_, i): Street[] => [
    { a: rotate(point(i * 106 - 210, -450)), b: rotate(point(i * 106 - 210, 1500)), kind: 'street' },
    { a: rotate(point(-700, i * 111 - 360)), b: rotate(point(1900, i * 111 - 360)), kind: 'street' },
  ]).flat(),
  ...[
    [[-100,360],[240,250],[620,118],[1260,-100]],
    [[-100,675],[205,542],[513,442],[890,328],[1270,176]],
    [[66,1000],[361,828],[648,688],[1230,491]],
    [[14,-150],[147,152],[296,486],[460,1000]],
    [[365,-160],[455,73],[600,396],[838,1010]],
    [[930,-90],[996,128],[1090,411],[1280,894]],
  ].flatMap((points) => lines(points, 'arterial')),
  // Extend bridge approaches to the intersecting streets on both banks.
  ...[[[570,349],[827,268]], [[639,632],[875,552]], [[551,769],[770,831]]]
    .flatMap((points) => lines(points, 'bridge')),
];
export const riverCurves = [
  [[975,-100],[960,10],[857,78],[768,136]],
  [[768,136],[682,192],[675,270],[697,349]],
  [[697,349],[721,429],[783,466],[779,541]],
  [[779,541],[775,617],[695,671],[666,747]],
  [[666,747],[635,825],[651,900],[550,1000]],
];
export const riverPath = `M ${riverCurves[0][0].join(' ')} ` + riverCurves.map((curve) => `C ${curve.slice(1).map((p) => p.join(' ')).join(' ')}`).join(' ');
const riverPoints = riverCurves.flatMap((curve) => Array.from({ length: 41 }, (_, i) => {
  const t = i / 40, s = 1 - t;
  return point(...[0, 1].map((axis) => s ** 3 * curve[0][axis] + 3 * s ** 2 * t * curve[1][axis] + 3 * s * t ** 2 * curve[2][axis] + t ** 3 * curve[3][axis]) as [number, number]);
}));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Point, b: Point, t: number) => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const isRiver = (p: Point) => riverPoints.some((r) => distance(p, r) < 43);
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const minus = (a: Point, b: Point) => point(a.x - b.x, a.y - b.y);
const cuts = streets.map(() => [0, 1]);
for (let i = 0; i < streets.length; i++) for (let j = i + 1; j < streets.length; j++) {
  const a = streets[i], b = streets[j], r = minus(a.b, a.a), s = minus(b.b, b.a);
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-8) continue;
  const delta = minus(b.a, a.a), t = cross(delta, s) / denominator, u = cross(delta, r) / denominator;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { cuts[i].push(t); cuts[j].push(u); }
}
const nodes: Point[] = [];
const nodeIds = new Map<string, number>();
const nodeId = (p: Point) => {
  const key = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  if (!nodeIds.has(key)) { nodeIds.set(key, nodes.length); nodes.push(p); }
  return nodeIds.get(key)!;
};
const edges: { a: number; b: number; length: number; kind: Street['kind'] }[] = [];
streets.forEach((street, i) => {
  const sorted = [...new Set(cuts[i])].sort((a, b) => a - b);
  sorted.slice(1).forEach((t, k) => {
    const a = lerp(street.a, street.b, sorted[k]), b = lerp(street.a, street.b, t);
    const length = distance(a, b);
    if (length < 0.001) return;
    // Roads under the river are not traversable; crossings use the drawn bridges.
    const samples = Math.ceil(length / 6);
    if (street.kind !== 'bridge' && Array.from({ length: samples + 1 }, (_, n) => lerp(a, b, n / samples)).some(isRiver)) return;
    edges.push({ a: nodeId(a), b: nodeId(b), length, kind: street.kind });
  });
});
const adjacency = nodes.map(() => [] as { id: number; length: number }[]);
edges.forEach(({ a, b, length }) => { adjacency[a].push({ id: b, length }); adjacency[b].push({ id: a, length }); });
// Only snap to the connected city network, excluding isolated fragments at the map edge.
const visited = new Set<number>();
let city = new Set<number>();
nodes.forEach((_, id) => {
  if (visited.has(id)) return;
  const component = new Set<number>(), queue = [id];
  while (queue.length) {
    const next = queue.pop()!;
    if (visited.has(next)) continue;
    visited.add(next); component.add(next);
    queue.push(...adjacency[next].map((edge) => edge.id));
  }
  if (component.size > city.size) city = component;
});
export const routableStreets = edges.filter((edge) => city.has(edge.a)).map((edge) => ({ ...edge, start: nodes[edge.a], end: nodes[edge.b] }));
function snap(p: Point) {
  return routableStreets.map((edge) => {
    const a = nodes[edge.a], b = nodes[edge.b], delta = minus(b, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * delta.x + (p.y - a.y) * delta.y) / edge.length ** 2));
    const position = lerp(a, b, t);
    return { edge, position, distance: distance(p, position) };
  }).reduce((a, b) => a.distance < b.distance ? a : b);
}
function routeBetween(start: Point, end: Point): Point[] {
  if (distance(start, end) < 0.001) return [start];
  const from = snap(start), to = snap(end);
  if (from.edge === to.edge) return [start, from.position, to.position, end];
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), done = new Set<number>();
  for (const id of [from.edge.a, from.edge.b]) costs[id] = distance(from.position, nodes[id]);
  while (done.size < city.size) {
    let current = -1;
    city.forEach((id) => { if (!done.has(id) && (current === -1 || costs[id] < costs[current])) current = id; });
    if (current === -1 || !Number.isFinite(costs[current])) break;
    done.add(current);
    if (done.has(to.edge.a) && done.has(to.edge.b)) break;
    for (const edge of adjacency[current]) {
      const cost = costs[current] + edge.length;
      if (cost < costs[edge.id]) { costs[edge.id] = cost; previous[edge.id] = current; }
    }
  }
  let endId = costs[to.edge.a] + distance(nodes[to.edge.a], to.position) < costs[to.edge.b] + distance(nodes[to.edge.b], to.position) ? to.edge.a : to.edge.b;
  const path: Point[] = [];
  while (endId !== -1) { path.unshift(nodes[endId]); endId = previous[endId]; }
  return [start, from.position, ...path, to.position, end];
}
export function streetRoute(stops: Coordinate[]): Coordinate[] {
  if (stops.length < 2) return stops.map(({ lng, lat }) => ({ lng, lat }));
  const path = stops.slice(1).flatMap((stop, i) => routeBetween(project(stops[i]), project(stop)));
  return path.filter((p, i) => !i || distance(p, path[i - 1]) > 0.001)
    .map((p) => ({ lng: 121.4 + p.x / 1200 * 0.17, lat: 31.28 - p.y / 880 * 0.09 }));
}
