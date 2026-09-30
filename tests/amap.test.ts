import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmapPlaces, parseAmapRoute } from '../src/services/amap-api';
import { initialData } from '../src/lib/data';
import { migrateData, isVerifiedPlace } from '../src/lib/location';
import { dayConnections } from '../src/lib/connections';
import { parsePlannerData, serializePlannerData } from '../src/lib/transfer';
import { createRouteMapSvg } from '../src/lib/export';
import { buildMockRoute } from '../src/services/map-service';
import { calculateAmapRoute } from '../src/services/amap-routing';
import { routeAmap } from '../src/services/server/amap';
import { POST } from '../src/app/api/amap/route/route';
import { project } from '../src/lib/map-geometry';

const a = { lng: 121.1, lat: 31.1 }, b = { lng: 121.2, lat: 31.2 };
test('AMap POI provenance is explicit and invalid coordinates are skipped', () => {
  const places = parseAmapPlaces({ status: '1', pois: [{ id: 'B001', name: '地点', location: '121.1,31.1', address: [], type: [] }, { id: 'bad', name: 'bad', location: 'oops' }] });
  assert.equal(places.length, 1); assert.ok(isVerifiedPlace(places[0]));
  assert.equal(places[0].id, 'amap:B001');
  assert.throws(() => parseAmapPlaces({ status: '0', infocode: '10003' }), /10003/);
});
test('AMap units remain metres/seconds and offsets are explicitly unverified connectors', () => {
  const route = { paths: [{ distance: '1200', duration: '240', steps: [{ polyline: '121.11,31.11;121.19,31.19' }] }] };
  const result = parseAmapRoute({ status: '1', route }, 'driving', a, b);
  assert.equal(result.distance, 1200); assert.equal(result.duration, 240); assert.equal(result.connectors?.length, 2);
  assert.deepEqual(parseAmapRoute({ errcode: 0, data: route }, 'riding', a, b), result);
  assert.throws(() => parseAmapRoute({ status: '1', route: { paths: [] } }, 'walking', a, b), /可达/);
  assert.throws(() => parseAmapRoute({ status: '1', route: { paths: [{ distance: 'x', duration: 2 }] } }, 'walking', a, b), /无效/);
  const mock = buildMockRoute([a, b], 30); assert.ok(Math.abs(mock.duration - mock.distance / 30000 * 3600) < 1e-7);
});
test('legacy migration preserves original objects and marks unknown coordinates', () => {
  const before = serializePlannerData(initialData), migrated = migrateData(initialData);
  assert.equal(serializePlannerData(initialData), before);
  assert.equal(migrated.version, 2); assert.equal(migrated.trip.days[0].routes[0].stops[0].provider, 'mock');
  const legacy = structuredClone(initialData); delete legacy.trip.days[0].routes[0].stops[0].provider;
  assert.equal(migrateData(legacy).trip.days[0].routes[0].stops[0].provider, 'unknown');
  assert.deepEqual(parsePlannerData(serializePlannerData(migrated)).data, migrated);
  assert.equal(migrated.trip.days[0].routes[0].stops[0].id, initialData.trip.days[0].routes[0].stops[0].id);
});
test('transfers skip empty routes but retain hidden endpoints and explicit pair settings', () => {
  const day = structuredClone(initialData.trip.days[0]);
  day.routes.splice(1, 0, { ...day.routes[0], id: 'empty', stops: [] });
  day.routes[0].visible = false;
  let result = dayConnections(day); assert.equal(result.length, 1); assert.equal(result[0].to.id, 'route-2'); assert.equal(result[0].visible, false);
  day.transfers = [{ fromRouteId: 'route-1', toRouteId: 'route-2', enabled: false, mode: 'riding' }];
  result = dayConnections(day); assert.equal(result[0].enabled, false); assert.equal(result[0].mode, 'riding');
  day.routes.reverse(); result = dayConnections(day); assert.equal(result[0].from.id, 'route-2'); assert.equal(result[0].enabled, true);
});
test('export uses supplied geometry only and continues numbering between routes', () => {
  const data = structuredClone(initialData);
  const absent = createRouteMapSvg(data); assert.ok(!absent.includes('<polyline'));
  assert.ok(absent.includes('>4</text>')); assert.ok(absent.includes('>5</text>'));
  const svg = createRouteMapSvg(data, '', { 'route-1': { status: 'ready', geometry: { source: 'amap', path: [a, b], distance: 1, duration: 1 } } });
  assert.ok(svg.includes('<polyline'));
});
test('export fits transfer detours and connectors and labels transfer-only AMap geometry', () => {
  const data = structuredClone(initialData);
  data.trip.days = [data.trip.days[0]];
  data.trip.days[0].routes.forEach(route => { route.stops = route.stops.slice(0, 1); });
  const connection = dayConnections(data.trip.days[0])[0];
  const detour = { lng: 122.2, lat: 33.2 }, connector = { lng: 120.2, lat: 30.1 };
  const geometry = { source: 'amap' as const, path: [a, detour, b], paths: [[a, detour, b]], connectors: [[b, connector]], distance: 1234, duration: 321 };
  const svg = createRouteMapSvg(data, '', {}, { [connection.id]: { status: 'ready', geometry } });
  assert.ok(svg.includes('高德道路几何 · 不含高德底图'));
  assert.ok(!svg.includes('Mock 演示几何'));
  const transform = svg.match(/<g transform="translate\(([-\d.e+]+) ([-\d.e+]+)\) scale\(([-\d.e+]+)\)">/)!;
  assert.ok(transform);
  const [, tx, ty, scale] = transform.map(Number);
  for (const point of [a, detour, b, connector]) {
    const p = project(point), x = tx + p.x * scale, y = ty + p.y * scale;
    assert.ok(x >= 0 && x <= 1600 && y >= 0 && y <= 850, 'all supplied geometry fits within the exported map');
  }
  assert.ok(createRouteMapSvg(data).includes('无已就绪道路几何'));
});
test('export keeps all visit numbers visible when a POI is repeated', () => {
  const data = structuredClone(initialData);
  const day = data.trip.days[0], first = day.routes[0].stops[0];
  day.routes[1].stops = [{ ...first, id: 'repeat', order: 0 }];
  const svg = createRouteMapSvg(data);
  assert.ok(svg.includes('>1 / 4</text>'));
});
test('segment planner deduplicates unchanged requests and handles zero/repeated stops', async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return Response.json({ source: 'amap', path: [a, b], paths: [[a, b]], distance: 1200, duration: 240 }); };
  try {
    const [first, second] = await Promise.all([calculateAmapRoute([a, b], 'walking'), calculateAmapRoute([a, b], 'walking')]);
    assert.equal(calls, 1); assert.deepEqual(first, second);
    assert.equal((await calculateAmapRoute([a, a], 'walking')).distance, 0);
    assert.equal((await calculateAmapRoute([], 'walking')).path.length, 0);
  } finally { global.fetch = original; }
});
test('editing a route stops subsequent real segment requests', async () => {
  const original = global.fetch; let calls = 0, current = true;
  global.fetch = async () => { calls++; current = false; return Response.json({ source: 'amap', path: [a, b], distance: 1, duration: 1 }); };
  try {
    await assert.rejects(calculateAmapRoute([a, b, { lng: 121.3, lat: 31.3 }], 'riding', () => current), /停止旧任务/);
    assert.equal(calls, 1);
  } finally { global.fetch = original; }
});
test('failed segments can be retried without cached errors or invented geometry', async () => {
  const original = global.fetch; let calls = 0;
  const points = [{ lng: 121.41, lat: 31.41 }, { lng: 121.42, lat: 31.42 }];
  global.fetch = async () => ++calls === 1
    ? Response.json({ error: '高德规划失败（10003）' }, { status: 503 })
    : Response.json({ source: 'amap', path: points, distance: 123, duration: 45 });
  try {
    await assert.rejects(calculateAmapRoute(points, 'driving'), /10003/);
    const result = await calculateAmapRoute(points, 'driving');
    assert.equal(calls, 2); assert.equal(result.distance, 123); assert.deepEqual(result.path, points);
  } finally { global.fetch = original; }
});
test('proxy rejects unsupported modes, malformed coordinates and arbitrary forwarding parameters', async () => {
  await assert.rejects(routeAmap(a, b, 'constructor' as never), /交通方式/);
  await assert.rejects(routeAmap({ lng: NaN, lat: 0 }, b, 'walking'), /无效/);
  const response = await POST(new Request('http://localhost/api/amap/route', { method: 'POST', body: JSON.stringify({ url: 'https://example.com', mode: 'walking' }) }));
  assert.equal(response.status, 400);
});
test('API quota and unreachable failures never produce replacement geometry', () => {
  assert.throws(() => parseAmapRoute({ status: '0', infocode: '10003' }, 'driving', a, b), /10003/);
  assert.throws(() => parseAmapRoute({ errcode: 10001 }, 'riding', a, b), /10001/);
  assert.equal(buildMockRoute([a, a]).distance, 0);
});
