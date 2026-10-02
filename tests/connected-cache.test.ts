import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedRoutes, setIncomingMode } from '../src/lib/connected-routes';
import { defaultCachePolicy, type PublicMapConfig } from '../src/lib/map-config';
import { migrateMapCache } from '../src/services/server/map-config';
import { configureMapCache, mapFetch, invalidateBrowserMapCache, mapCacheNamespace } from '../src/services/map-request';
import { validatePlannerData } from '../src/lib/transfer';

test('daily places connect across old groups without changing saved stops or crossing days', () => {
  const data = validatePlannerData({ trip: { name: 'fixture', days: [{ routes: [
    { mode: 'driving', stops: [{ name: 'A' }, { name: 'B' }] },
    { mode: 'walking', stops: [{ name: 'C' }] },
    { mode: 'walking', stops: [] },
    { mode: 'riding', stops: [{ name: 'D' }] },
  ] }, { routes: [{ stops: [{ name: 'E' }] }] }] } }).data;
  const before = JSON.stringify(data);
  assert.deepEqual(connectedRoutes(data.trip.days[0]).map(r => r.stops.map(s => s.name)), [['A', 'B'], ['B', 'C'], [], ['C', 'D']]);
  assert.deepEqual(connectedRoutes(data.trip.days[1])[0].stops.map(s => s.name), ['E']);
  assert.equal(JSON.stringify(data), before);
  data.trip.days[0].routes[1].visible = false;
  assert.deepEqual(connectedRoutes(data.trip.days[0])[3].stops.map(s => s.name), ['B', 'D']);
});

test('existing policies migrate once to three days; subsequently saved custom policies survive', () => {
  assert.deepEqual(Object.values(defaultCachePolicy.ttl), Array(6).fill(4320));
  const old = { provider: 'mock' as const, jsKey: '', webKey: '', securityCode: '', baseURL: 'https://fixture.invalid', revision: 'old', cache: { ...structuredClone(defaultCachePolicy), ttl: { city: 10080, search: 1440, walking: 1440, riding: 1440, driving: 15, subway: 4320 } } };
  const migrated = migrateMapCache(old);
  assert.deepEqual(migrated.cache.ttl, defaultCachePolicy.ttl);
  assert.equal(migrateMapCache(migrated), migrated);
  migrated.cache.ttl.driving = 60;
  assert.equal(migrateMapCache(migrated).cache.ttl.driving, 60);
  assert.equal(old.cache.ttl.driving, 15);
});

test('changing one incoming journey does not change modes of neighbouring places', () => {
  const day = validatePlannerData({ trip: { name: 'fixture', days: [{ routes: [{ mode: 'walking', notes: 'preserve', stops: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] }] }] } }).data.trip.days[0];
  const source = day.routes[0];
  const changed = setIncomingMode(day, source.id, source.stops[2].id, 'driving', ['new-1', 'new-2']);
  assert.deepEqual(changed.routes.map(r => r.mode), ['walking', 'driving', 'walking']);
  assert.deepEqual(connectedRoutes(changed).map(r => r.stops.map(s => s.name)), [['A', 'B'], ['B', 'C'], ['C', 'D']]);
  assert.deepEqual(changed.routes.flatMap(r => r.stops.map(s => s.id)), source.stops.map(s => s.id));
  assert.equal(changed.routes[0].notes, 'preserve');
  assert.equal(source.stops.length, 4);
});

test('browser persistence survives reconfiguration, expires at original fetch + 3 days, and isolates clear/settings/modes', async () => {
  const descriptors = new Map(['window', 'caches', 'fetch', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const now = Date.now;
  let clock = now(), requests = 0, fail = false;
  const saved = new Map<string, Response>();
  const fakeCache = {
    match: async (key: string) => saved.get(key)?.clone(),
    put: async (key: string, response: Response) => { saved.set(key, response.clone()); },
    delete: async (key: string | Request) => saved.delete(typeof key === 'string' ? key : key.url),
    keys: async () => [...saved.keys()].map(key => new Request(key)),
  };
  const config: PublicMapConfig = { provider: 'amap', jsKey: '', hasWebKey: true, hasSecurityCode: true, baseURL: 'https://fixture.invalid', revision: 'fixture', cacheEpoch: '0', cache: structuredClone(defaultCachePolicy), ready: true, missing: [] };
  const route = (mode = 'walking') => mapFetch('/api/amap/route', { method: 'POST', body: JSON.stringify({ mode, origin: { lng: 110, lat: 30 }, destination: { lng: 111, lat: 30 } }) });
  try {
    Date.now = () => clock;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://fixture.test' } } });
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => fakeCache } });
    let invalidation = '';
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => invalidation, setItem: (_key: string, value: string) => { invalidation = value; } } });
    globalThis.fetch = async () => { requests++; return Response.json(fail ? { error: 'fixture' } : { path: [], distance: 10 }, { status: fail ? 503 : 200, headers: { 'X-Map-Calculated-At': String(clock), 'X-Amap-Upstream-Requests': '1' } }); };
    configureMapCache(config);
    await route();
    clock += 3 * 86_400_000 - 1;
    configureMapCache(structuredClone(config)); // New app instance, same persisted namespace.
    const cached = await route();
    assert.equal(requests, 1);
    assert.equal(cached.headers.get('X-Amap-Upstream-Requests'), '0');
    clock++;
    await route(); assert.equal(requests, 2);
    await route('driving'); assert.equal(requests, 3);
    configureMapCache({ ...config, cacheEpoch: '1' });
    await route(); assert.equal(requests, 4);
    configureMapCache({ ...config, revision: 'changed' });
    await route(); assert.equal(requests, 5);
    fail = true;
    await mapFetch('/api/amap/search?q=failed');
    await mapFetch('/api/amap/search?q=failed');
    assert.equal(requests, 7);
    fail = false;
    configureMapCache({ ...config, cache: { ...config.cache, enabled: false } });
    await route(); await route(); assert.equal(requests, 9);
    configureMapCache(config);
    const namespace = mapCacheNamespace();
    invalidateBrowserMapCache(); // Another same-origin window clears or updates settings.
    assert.notEqual(mapCacheNamespace(), namespace);
    await route(); assert.equal(requests, 10);
  } finally {
    Date.now = now;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
