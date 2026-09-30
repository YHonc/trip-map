import test from 'node:test';
import assert from 'node:assert/strict';
import { initialViewport, readWorkspaceMemory, restoreSelection, writeWorkspaceMemory } from '../src/lib/workspace-memory';
import { mapPickedPlace, parseAmapAddress } from '../src/lib/map-pick';
import { parsePlannerData, serializePlannerData } from '../src/lib/transfer';
import { isVerifiedPlace } from '../src/lib/location';
import type { City, PlannerData } from '../src/lib/types';
import { reverseAmap } from '../src/services/server/amap';
import { GET } from '../src/app/api/amap/regeocode/route';

const city: City = { name: '厦门市', adcode: '350200', lng: 118.0894, lat: 24.4798, provider: 'amap', coordinateSystem: 'GCJ-02' };
const data: PlannerData = { version: 2, trip: { id: 'fixture-trip', name: '厦门旅行', days: [
  { id: 'day-a', name: '第一天', date: '2026-09-30', color: '#237bff', routes: [] },
  { id: 'day-b', name: '第二天', date: '2026-10-01', color: '#237bff', city, routes: [{ id: 'route-b', name: '海边', color: '#237bff', visible: true, mode: 'walking', stops: [] }] },
] }, favorites: [] };
test('restores the saved day/route and falls back safely when IDs no longer exist', () => {
  const selection = restoreSelection(data, { activeDayId: 'day-b', activeRouteId: 'route-b', activeStopId: 'old-stop' });
  assert.deepEqual(selection, { activeDayId: 'day-b', activeRouteId: 'route-b', activeStopId: null });
  assert.deepEqual(initialViewport(data, selection), { center: { lng: city.lng, lat: city.lat }, zoom: 11 });
  assert.deepEqual(restoreSelection(data, { activeDayId: 'missing', activeRouteId: 'route-b', activeStopId: null }), { activeDayId: 'day-a', activeRouteId: null, activeStopId: null });
  assert.equal(initialViewport(data, restoreSelection(data)).center.lng, city.lng);
});
test('viewport memory is isolated by plan, merges selection, tolerates corruption and unavailable storage', () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    const selection = restoreSelection(data);
    writeWorkspaceMemory('a', { selection });
    writeWorkspaceMemory('a', { center: { lng: 120, lat: 30 }, zoom: 14 });
    assert.deepEqual(readWorkspaceMemory('a'), { selection, center: { lng: 120, lat: 30 }, zoom: 14 });
    assert.equal(readWorkspaceMemory('b'), undefined);
    assert.deepEqual(initialViewport(data, selection, readWorkspaceMemory('a')), { center: { lng: 120, lat: 30 }, zoom: 14 });
    values.set('trip-map-workspace-v1:a', '{broken');
    assert.equal(readWorkspaceMemory('a'), undefined);
    values.set('trip-map-workspace-v1:a', JSON.stringify({ selection, center: { lng: 500, lat: 24 }, zoom: -4 }));
    assert.deepEqual(readWorkspaceMemory('a'), { selection });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    assert.doesNotThrow(() => writeWorkspaceMemory('a', { selection }));
    assert.equal(readWorkspaceMemory('a'), undefined);
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
test('blank plans open a national overview; saved real places can determine the initial view', () => {
  const blank = { ...data, trip: { ...data.trip, days: [data.trip.days[0]] } };
  assert.equal(initialViewport(blank, restoreSelection(blank)).zoom, 4);
  const withPlace = { ...blank, favorites: [mapPickedPlace(city)] };
  assert.deepEqual(initialViewport(withPlace, restoreSelection(withPlace)), { center: { lng: city.lng, lat: city.lat }, zoom: 12 });
});
test('map picks preserve exact coordinates and explicit provenance across save/export/import', () => {
  const place = mapPickedPlace({ lng: 118.123456, lat: 24.987654 });
  assert.equal(place.poiId, undefined);
  assert.ok(isVerifiedPlace(place));
  assert.equal(isVerifiedPlace({ ...place, locationSource: undefined }), false);
  const saved = { ...data, favorites: [place] };
  assert.deepEqual(parsePlannerData(serializePlannerData(saved)).data.favorites[0], place);
  assert.equal(mapPickedPlace(city, '测试地点', 'B001').id, 'amap:B001');
  assert.throws(() => mapPickedPlace({ lng: NaN, lat: 20 }), /无效/);
  assert.throws(() => parsePlannerData(JSON.stringify({ ...data, favorites: [{ ...place, provider: 'mock' }] })), /来源无效/);
});
test('reverse geocoding handles absent addresses, API errors and malformed query input', async () => {
  assert.equal(parseAmapAddress({ status: '1', regeocode: { formatted_address: '测试地址' } }), '测试地址');
  assert.throws(() => parseAmapAddress({ status: '0', infocode: '10003' }), /10003/);
  assert.throws(() => parseAmapAddress({ status: '1', regeocode: { formatted_address: [] } }), /暂无/);
  assert.throws(() => reverseAmap({ lng: Infinity, lat: 24 }), /无效/);
  for (const query of ['lng=1', 'lng=&lat=2', 'lng=1&lat=2&url=https://example.invalid']) {
    const response = await GET(new Request(`http://127.0.0.1:3000/api/amap/regeocode?${query}`));
    assert.equal(response.status, 400);
  }
});
