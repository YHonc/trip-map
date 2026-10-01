import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestCache } from '../src/lib/request-cache';
import { applyCandidate, candidateDay, validateCandidate, type OptimizeOptions } from '../src/lib/optimization';
import { initialData } from '../src/lib/data';
import { localRequest } from '../src/services/server/ai';
import { searchAmap } from '../src/services/server/amap';
import { calculateAmapRoute, type RouteSegments } from '../src/services/amap-routing';
import { routingFingerprint } from '../src/lib/routing-fingerprint';
const options: OptimizeOptions = { scope: 'route', objective: 'distance', fixedStart: false, fixedEnd: false, lockedIds: [], allowRouteReorder: false };
const route = initialData.trip.days[0].routes[0];
const candidate = { routes: [{ id: route.id, stopIds: route.stops.map(s => s.id).reverse() }], explanation: '候选' };
test('AI rejects invented, duplicate, missing and cross-route stop IDs', () => {
  assert.doesNotThrow(() => validateCandidate(candidate, [route], options));
  for (const ids of [[...candidate.routes[0].stopIds, 'invented'], route.stops.map(() => route.stops[0].id), ['invented', ...route.stops.slice(1).map(s => s.id)]]) {
    assert.throws(() => validateCandidate({ ...candidate, routes: [{ id: route.id, stopIds: ids }] }, [route], options));
  }
});
test('AI fixed endpoints, locked relative order and route order are enforced', () => {
  assert.throws(() => validateCandidate(candidate, [route], { ...options, fixedStart: true }));
  assert.throws(() => validateCandidate(candidate, [route], { ...options, fixedEnd: true }));
  assert.throws(() => validateCandidate(candidate, [route], { ...options, lockedIds: route.stops.map(s => s.id) }));
  const routes = initialData.trip.days[0].routes;
  const reversed = { routes: routes.map(r => ({ id: r.id, stopIds: r.stops.map(s => s.id) })).reverse(), explanation: '' };
  assert.throws(() => validateCandidate(reversed, routes, options));
  assert.doesNotThrow(() => validateCandidate(reversed, routes, { ...options, allowRouteReorder: true }));
});
test('candidate application preserves other days/favorites, normalizes order and rejects stale trip', () => {
  const snapshot = JSON.stringify(initialData);
  const applied = applyCandidate(initialData, snapshot, initialData.trip.days[0].id, candidate);
  assert.equal(applied.favorites, initialData.favorites);
  assert.equal(applied.trip.days[1], initialData.trip.days[1]);
  assert.deepEqual(applied.trip.days[0].routes[0].stops.map(s => s.id), candidate.routes[0].stopIds);
  assert.deepEqual(applied.trip.days[0].routes[0].stops.map(s => s.order), route.stops.map(s => s.order));
  assert.equal(JSON.stringify(initialData), snapshot);
  assert.throws(() => applyCandidate(applied, snapshot, initialData.trip.days[0].id, candidate), /失效/);
  assert.equal(candidateDay(initialData.trip.days[0], candidate).routes[1], initialData.trip.days[0].routes[1]);
});
test('bounded cache keeps pending dedupe even after completed eviction; failures retry', async () => {
  const cache = new RequestCache<{ n: number }>(1, 20);
  let release!: (r: { n: number }) => void;
  let calls = 0;
  const first = cache.get('pending', () => { calls++; return new Promise(resolve => { release = resolve; }); });
  await cache.get('other', async () => ({ n: 2 }));
  const same = cache.get('pending', async () => { calls++; return { n: 3 }; });
  assert.equal(same, first); release({ n: 1 }); await first; assert.equal(calls, 1);
  await assert.rejects(cache.get('bad', async () => { throw new Error('network'); }));
  assert.deepEqual(await cache.get('bad', async () => ({ n: 4 })), { n: 4 });
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.deepEqual(await cache.get('bad', async () => ({ n: 5 })), { n: 5 });
});
test('server normalized repeated POI searches share one upstream call', async () => {
  const previous = process.env.AMAP_WEB_KEY; process.env.AMAP_WEB_KEY = 'isolated';
  let calls = 0;
  const fetcher = (async () => { calls++; return Response.json({ status: '1', pois: [] }); }) as typeof fetch;
  try { await Promise.all([searchAmap(' 外滩 ', fetcher), searchAmap('外滩', fetcher)]); await searchAmap('外滩', fetcher); assert.equal(calls, 1); }
  finally { if (previous === undefined) delete process.env.AMAP_WEB_KEY; else process.env.AMAP_WEB_KEY = previous; }
});
test('local AI endpoints refuse cross-origin and remote hosts', () => {
  assert.doesNotThrow(() => localRequest(new Request('http://localhost:3000/api/ai/config', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })));
  assert.doesNotThrow(() => localRequest(new Request('http://127.0.0.1:3000/api/ai/config', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })));
  assert.throws(() => localRequest(new Request('http://127.0.0.1:3000/api/ai/config', { headers: { host: '127.0.0.1:3000', origin: 'https://example.com' } })));
  assert.throws(() => localRequest(new Request('http://example.com/api/ai/config', { headers: { host: 'example.com' } })));
});
test('route metadata edits preserve geometry fingerprint; coordinate changes invalidate it', () => {
  assert.equal(routingFingerprint(route.mode, route.stops), routingFingerprint(route.mode, route.stops.map(s => ({ ...s, name: 'new', order: 99 }))));
  assert.notEqual(routingFingerprint(route.mode, route.stops), routingFingerprint(route.mode, route.stops.map(s => { assert.notEqual(s.lng, null); return { ...s, lng: s.lng! + 0.01 }; })));
});
test('more than 256 pending segments still share one request and obey concurrency limit', async () => {
  const original = globalThis.fetch;
  let calls = 0, active = 0, peak = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async () => { calls++; active++; peak = Math.max(peak, active); await gate; active--; return Response.json({ source: 'amap', path: [], distance: 1, duration: 1 }); }) as typeof fetch;
  try {
    const points = (i: number) => [{ lng: 100 + i / 1000, lat: 30 }, { lng: 101 + i / 1000, lat: 30 }];
    const tasks = Array.from({ length: 270 }, (_, i) => calculateAmapRoute(points(i), 'walking'));
    tasks.push(calculateAmapRoute(points(0), 'walking'));
    release(); await Promise.all(tasks);
    assert.equal(calls, 270); assert.ok(peak <= 3);
  } finally { globalThis.fetch = original; }
});

test('route edits request only changed edges even after the shared cache evicts unchanged edges', async () => {
  const original = globalThis.fetch;
  const calls: { origin: { lng: number; lat: number }; destination: { lng: number; lat: number }; mode: string }[] = [];
  globalThis.fetch = (async (_url, init) => {
    const edge = JSON.parse(String(init?.body)); calls.push(edge);
    return Response.json({ source: 'amap', path: [edge.origin, edge.destination], paths: [[edge.origin, edge.destination]], distance: 100, duration: 10 });
  }) as typeof fetch;
  const retained: RouteSegments = new Map();
  const [a, b, c, d, e, x] = [1, 2, 3, 4, 5, 6].map(n => ({ lng: 122 + n / 100, lat: 32 }));
  try {
    await calculateAmapRoute([a, b, c, d], 'walking', undefined, retained);
    assert.equal(calls.length, 3);
    // Eviction proves reuse is owned by the active route, not just the TTL LRU.
    for (let i = 0; i < 260; i++) await calculateAmapRoute([{ lng: 110 + i / 1000, lat: 20 }, { lng: 111 + i / 1000, lat: 20 }], 'walking');
    calls.length = 0;
    const appended = await calculateAmapRoute([a, b, c, d, e], 'walking', undefined, retained);
    assert.deepEqual(calls, [{ origin: d, destination: e, mode: 'walking' }]);
    assert.equal(appended.distance, 400); assert.equal(appended.duration, 40);
    calls.length = 0;
    const inserted = await calculateAmapRoute([a, b, x, c, d, e], 'walking', undefined, retained);
    assert.deepEqual(calls, [{ origin: b, destination: x, mode: 'walking' }, { origin: x, destination: c, mode: 'walking' }]);
    assert.deepEqual(inserted.paths, [[a, b], [b, x], [x, c], [c, d], [d, e]]);
    assert.equal(retained.size, 5);
    calls.length = 0;
    await calculateAmapRoute([a, b, c, d, e], 'walking', undefined, retained);
    assert.deepEqual(calls, [{ origin: b, destination: c, mode: 'walking' }]);
    assert.equal(retained.size, 4);
    calls.length = 0;
    const moved = { ...c, lat: 32.1 };
    await calculateAmapRoute([a, b, moved, d, e], 'walking', undefined, retained);
    assert.deepEqual(calls, [{ origin: b, destination: moved, mode: 'walking' }, { origin: moved, destination: d, mode: 'walking' }]);
    calls.length = 0;
    await calculateAmapRoute([a, b, moved, d, e].map(point => ({ ...point, name: 'renamed' })), 'walking', undefined, retained);
    assert.equal(calls.length, 0);
    await calculateAmapRoute([a, b, moved, d, e], 'driving', undefined, retained);
    assert.equal(calls.length, 4);
    await calculateAmapRoute([], 'driving', undefined, retained);
    assert.equal(retained.size, 0);
  } finally { globalThis.fetch = original; }
});

test('directed edges and modes cannot reuse reverse or incompatible roads', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ source: 'amap', path: [], distance: 1, duration: 1 }); }) as typeof fetch;
  const retained: RouteSegments = new Map();
  const a = { lng: 123.11, lat: 33 }, b = { lng: 123.12, lat: 33 };
  try {
    await calculateAmapRoute([a, b, b], 'walking', undefined, retained);
    assert.equal(calls, 1); assert.equal(retained.size, 1);
    await calculateAmapRoute([b, a], 'walking', undefined, retained);
    assert.equal(calls, 2); assert.equal(retained.size, 1);
    await calculateAmapRoute([b, a], 'riding', undefined, retained);
    assert.equal(calls, 3); assert.equal(retained.size, 1);
  } finally { globalThis.fetch = original; }
});

test('retry preserves successful edges and never caches a failed edge', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => ++calls === 2 ? Response.json({ error: 'fixture failure' }, { status: 503 }) : Response.json({ source: 'amap', path: [], distance: 1, duration: 1 })) as typeof fetch;
  const retained: RouteSegments = new Map();
  const stops = [1, 2, 3].map(n => ({ lng: 124 + n / 100, lat: 33 }));
  try {
    await assert.rejects(calculateAmapRoute(stops, 'walking', undefined, retained), /fixture failure/);
    assert.equal(retained.size, 1);
    await calculateAmapRoute(stops, 'walking', undefined, retained);
    assert.equal(calls, 3); assert.equal(retained.size, 2);
  } finally { globalThis.fetch = original; }
});

test('late responses from an edited route do not repopulate retained edges', async () => {
  const original = globalThis.fetch; let current = true;
  let started!: () => void, release!: () => void;
  const didStart = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async () => { started(); await gate; return Response.json({ source: 'amap', path: [], distance: 1, duration: 1 }); }) as typeof fetch;
  const retained: RouteSegments = new Map();
  try {
    const pending = calculateAmapRoute([{ lng: 125.1, lat: 33 }, { lng: 125.2, lat: 33 }], 'walking', () => current, retained);
    await didStart; current = false;
    await calculateAmapRoute([], 'walking', undefined, retained);
    release(); await assert.rejects(pending, /停止旧任务/);
    assert.equal(retained.size, 0);
  } finally { release(); globalThis.fetch = original; }
});
