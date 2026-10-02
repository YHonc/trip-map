import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmapRoute } from '../src/services/amap-api';
import { routeAmap } from '../src/services/server/amap';
import { validatePlannerData } from '../src/lib/transfer';
import { candidateDay, validateCandidate, validateOptimizationOptions, type OptimizeOptions } from '../src/lib/optimization';
import { migrateMapCache, type MapConfig } from '../src/services/server/map-config';
import { defaultCachePolicy } from '../src/lib/map-config';
import { connectedRoutes, setStopVisibility } from '../src/lib/connected-routes';
import { calculateVisits } from '../src/lib/itinerary-calculation';
import { favoriteDay, samePlace } from '../src/lib/favorites';
import { routingFingerprint } from '../src/lib/routing-fingerprint';
const origin = { lng: 118.1, lat: 24.5 }, destination = { lng: 118.2, lat: 24.6 };
const subway = (type = '地铁线路', duration: unknown = '900') => ({ duration, segments: [
  { walking: { distance: '100', steps: [{ polyline: '118.1,24.5;118.11,24.51' }] }, bus: { buslines: [{ type, distance: '5000', polyline: '118.11,24.51;118.19,24.59' }] } },
  { walking: { distance: '200', steps: [{ polyline: '118.19,24.59;118.2,24.6' }] }, bus: { buslines: [] } },
] });
const response = (transits: unknown[]) => ({ status: '1', route: { transits } });
test('subway uses the fastest complete subway candidate including walking distance and total time', () => {
  const route = parseAmapRoute(response([subway('普通公交线路', '100'), subway('地铁线路', '1800'), subway()]), 'subway', origin, destination);
  assert.equal(route.distance, 5300); assert.equal(route.duration, 900); assert.equal(route.paths?.length, 3);
  assert.deepEqual(route.path[0], origin); assert.deepEqual(route.path.at(-1), destination);
});
test('subway never substitutes a bus, train, walking-only or malformed route', () => {
  const rail = subway(); Object.assign(rail.segments[0], { railway: { name: '火车' } });
  const mixed = subway(); mixed.segments.push({ walking: { distance: '0', steps: [] }, bus: { buslines: [{ type: '普通公交线路', distance: '50', polyline: '118.1,24.5;118.2,24.6' }] } });
  for (const transit of [subway('普通公交线路'), subway('地铁线路', null), subway('地铁线路', 'oops'), rail, mixed, { duration: 10, segments: [{ walking: { distance: 2, steps: [] } }] }]) {
    assert.throws(() => parseAmapRoute(response([transit]), 'subway', origin, destination), /未找到可用的地铁/);
  }
});
test('subway requests use the transit API and city-scoped reusable cache; city required before network', async () => {
  const oldKey = process.env.AMAP_WEB_KEY; process.env.AMAP_WEB_KEY = 'fixture-subway-only';
  try {
  let calls = 0;
  const fetcher: typeof fetch = async input => { calls++; const url = new URL(String(input)); assert.match(url.pathname, /transit\/integrated/); assert.equal(url.searchParams.get('strategy'), '0'); assert.ok(url.searchParams.get('city')); return Response.json(response([subway()])); };
  assert.throws(() => routeAmap(origin, destination, 'subway', fetcher), /选择城市/);
  await routeAmap(origin, destination, 'subway', fetcher, '厦门市');
  await routeAmap(origin, destination, 'subway', fetcher, '厦门市'); assert.equal(calls, 1);
  await routeAmap(origin, destination, 'subway', fetcher, '福州市'); assert.equal(calls, 2);
  } finally { if (oldKey === undefined) delete process.env.AMAP_WEB_KEY; else process.env.AMAP_WEB_KEY = oldKey; }
});
function fixture() {
  return validatePlannerData({ trip: { name: 'fixture', days: [{ id: 'day', departureTime: '09:00', routes: [
    { id: 'r1', stops: [{ id: 'a', name: '甲', stayMinutes: 15 }, { id: 'b', name: '乙', stayMinutes: 30 }, { id: 'c', name: '丙', stayMinutes: 45 }] },
    { id: 'empty', visible: false, stops: [] },
    { id: 'r2', stops: [{ id: 'd', name: '丁', stayMinutes: 15 }] },
  ] }] } }).data;
}
const options: OptimizeOptions = { scope: 'route', objective: 'custom', customInstructions: '先去乙，再去甲', fixedStart: true, fixedEnd: true, startStopId: 'b', endStopId: 'a', lockedIds: [], allowRouteReorder: false };
test('explicit selected endpoints can differ from the original first and last, with custom goals', () => {
  const routes = [fixture().trip.days[0].routes[0]];
  const candidate = { routes: [{ id: 'r1', stopIds: ['b','c','a'] }], explanation: '先乙后甲' };
  assert.deepEqual(validateCandidate(candidate, routes, options), candidate);
  assert.throws(() => validateCandidate({ ...candidate, routes: [{ id: 'r1', stopIds: ['a','c','b'] }] }, routes, options), /固定起点/);
  for (const patch of [{ startStopId: 'missing' }, { endStopId: 'b' }, { customInstructions: ' ' }, { startStopId: undefined }]) assert.throws(() => validateOptimizationOptions(routes, { ...options, ...patch }));
});
test('day endpoints constrain the complete selected itinerary, preserving routes and locked order', () => {
  const routes = fixture().trip.days[0].routes.filter(r => r.visible);
  const opts = { ...options, scope: 'day' as const, allowRouteReorder: true, startStopId: 'd', endStopId: 'a' };
  const candidate = { routes: [{ id: 'r2', stopIds: ['d'] }, { id: 'r1', stopIds: ['b','c','a'] }], explanation: '顺序' };
  assert.deepEqual(validateCandidate(candidate, routes, opts), candidate);
  const applied = candidateDay(fixture().trip.days[0], candidate).routes.filter(r => r.visible).flatMap(r => r.stops);
  assert.equal(applied[0].id, 'd'); assert.equal(applied.at(-1)!.id, 'a');
  assert.throws(() => validateCandidate(candidate, routes, { ...opts, allowRouteReorder: false }));
  assert.throws(() => validateCandidate(candidate, routes, { ...opts, lockedIds: ['a','b'] }), /相对顺序/);
});
test('existing three-day cache policies gain subway without overwriting customized lifetimes', () => {
  const config: MapConfig = { provider: 'mock', jsKey: '', webKey: '', securityCode: '', baseURL: 'https://fixture.invalid', revision: 'saved', cacheVersion: 2, cache: structuredClone(defaultCachePolicy) };
  config.cache.ttl.driving = 45;
  delete (config.cache.ttl as Partial<typeof config.cache.ttl>).subway;
  const migrated = migrateMapCache(config);
  assert.equal(migrated.cache.ttl.subway, 4320); assert.equal(migrated.cache.ttl.driving, 45); assert.equal(migrated.revision, 'saved');
});
test('hidden and empty groups do not cut connections; restoring a stop recovers incoming selection and schedule', () => {
  const data = fixture(), day = data.trip.days[0];
  const hidden = setStopVisibility(day, 'r1', 'b', false, ['hidden-b', 'visible-c']);
  const connections = connectedRoutes(hidden);
  assert.deepEqual(connections.find(r => r.id === 'visible-c')!.stops.map(s => s.id), ['a','c']);
  assert.deepEqual(connections.at(-1)!.stops.map(s => s.id), ['c','d']);
  const shown = setStopVisibility(hidden, 'hidden-b', 'b', true, ['unused1','unused2']);
  assert.deepEqual(connectedRoutes(shown).find(r => r.id === 'hidden-b')!.stops.map(s => s.id), ['a','b']);
  data.trip.days[0] = hidden;
  const result = { status: 'ready' as const, geometry: { path: [], distance: 1, duration: 300, legs: [{ distance: 1, duration: 300 }] } };
  assert.equal(calculateVisits(data, { 'visible-c': result, r2: result }).d.arrival, 610);
});
test('bulk favorite is deduplicated, includes hidden places and leaves schedules in the itinerary', () => {
  const data = fixture(); data.trip.days[0].routes[0].visible = false;
  const saved = favoriteDay(data, 'day');
  assert.equal(saved.favorites.length, 4); assert.equal(data.favorites.length, 0);
  assert.equal(favoriteDay(saved, 'day'), saved);
  assert.ok(!('stayMinutes' in saved.favorites[0]));
  assert.ok(samePlace(saved.favorites[0], data.trip.days[0].routes[0].stops[0]));
  assert.equal(saved.trip, data.trip);
});
test('subway survives import and city changes invalidate route fingerprints', () => {
  const data = fixture(); data.trip.days[0].routes[0].mode = 'subway';
  assert.equal(validatePlannerData(data).data.trip.days[0].routes[0].mode, 'subway');
  const stops = data.trip.days[0].routes[0].stops;
  assert.notEqual(routingFingerprint('subway', stops, '厦门市'), routingFingerprint('subway', stops, '福州市'));
  assert.equal(routingFingerprint('walking', stops, '厦门市'), routingFingerprint('walking', stops, '福州市'));
});
