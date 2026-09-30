import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/lib/data';
import { effectiveCity, selectedCity, setCity } from '../src/lib/city';
import { applyRepairs, repairGroups } from '../src/lib/poi-repair';
import { parseCities } from '../src/services/server/cities';
import { parsePlannerData, serializePlannerData } from '../src/lib/transfer';
import { searchAmap } from '../src/services/server/amap';
import type { City, Place } from '../src/lib/types';
const shanghai: City = { name: '上海市', adcode: '310000', lng: 121.4737, lat: 31.2304, provider: 'amap', coordinateSystem: 'GCJ-02' };
const hangzhou: City = { ...shanghai, name: '杭州市', adcode: '330100', lng: 120.2108, lat: 30.246 };
test('route city overrides day city, clearing override restores inheritance without moving stops', () => {
  const dayId = initialData.trip.days[0].id, routeId = initialData.trip.days[0].routes[0].id;
  let data = setCity(initialData, dayId, undefined, shanghai);
  assert.equal(effectiveCity(data.trip.days[0], routeId)?.adcode, '310000');
  data = setCity(data, dayId, routeId, hangzhou);
  assert.equal(selectedCity(data, { activeDayId: dayId, activeRouteId: routeId, activeStopId: null })?.adcode, '330100');
  assert.deepEqual(data.trip.days[0].routes[0].stops, initialData.trip.days[0].routes[0].stops);
  data = setCity(data, dayId, routeId, undefined);
  assert.equal(effectiveCity(data.trip.days[0], routeId)?.adcode, '310000');
});
test('city configuration survives JSON round trip and invalid city metadata is rejected', () => {
  const data = setCity(initialData, initialData.trip.days[0].id, undefined, shanghai);
  assert.deepEqual(parsePlannerData(serializePlannerData(data)).data.trip.days[0].city, shanghai);
  assert.throws(() => parsePlannerData(JSON.stringify({ ...data, trip: { ...data.trip, days: [{ ...data.trip.days[0], city: { ...shanghai, adcode: 'invalid' } }] } })), /城市/);
});
test('district adapter accepts true city centers and municipalities, excludes districts and malformed coordinates', () => {
  const cities = parseCities({ status: '1', districts: [{ name: '上海市', adcode: '310000', center: '121.47,31.23', level: 'province' }, { name: '杭州市', adcode: '330100', center: '120.2,30.2', level: 'city' }, { name: '黄浦区', adcode: '310101', center: '121,31', level: 'district' }, { name: 'bad', adcode: '123456', center: 'NaN,31', level: 'city' }] });
  assert.deepEqual(cities.map(c => c.adcode), ['310000', '330100']);
});
test('POI repair preserves repeat visits, IDs, routes, unselected stops and stale protection', () => {
  const data = structuredClone(initialData), route = data.trip.days[0].routes[0];
  route.stops.push({ ...route.stops[0], id: 'repeat-stop', order: route.stops.length });
  const groups = repairGroups(data), group = groups.find(g => g.stopIds.includes('repeat-stop'))!;
  assert.equal(group.stopIds.length, 2);
  const poi: Place = { id: 'amap:known', poiId: 'known', provider: 'amap', coordinateSystem: 'GCJ-02', name: '核实地点', address: '核实地址', lng: 121.48, lat: 31.23, category: '地点' };
  const next = applyRepairs(data, JSON.stringify(data), groups, { [group.key]: poi });
  assert.deepEqual(next.trip.days[0].routes[0].stops.map(s => s.id), route.stops.map(s => s.id));
  assert.equal(next.trip.days[0].routes[0].stops.at(-1)?.poiId, 'known');
  assert.deepEqual(next.trip.days[0].routes[0].stops[1], route.stops[1]);
  assert.deepEqual(next.favorites, data.favorites);
  assert.throws(() => applyRepairs(next, JSON.stringify(data), groups, {}), /行程已修改/);
});
test('city scoped search uses citylimit and separate cache keys', async () => {
  const previous = process.env.AMAP_WEB_KEY; process.env.AMAP_WEB_KEY = 'fixture';
  const urls: URL[] = [];
  const fetcher = (async (url: string | URL | Request) => { urls.push(new URL(String(url))); return Response.json({ status: '1', pois: [] }); }) as typeof fetch;
  try {
    await searchAmap('博物馆', fetcher, '310000'); await searchAmap('博物馆', fetcher, '330100'); await searchAmap('博物馆', fetcher, '310000');
    assert.equal(urls.length, 2); assert.equal(urls[0].searchParams.get('citylimit'), 'true'); assert.equal(urls[1].searchParams.get('city'), '330100');
    assert.throws(() => searchAmap('博物馆', fetcher, 'anywhere'), /城市编码/);
  } finally { if (previous === undefined) delete process.env.AMAP_WEB_KEY; else process.env.AMAP_WEB_KEY = previous; }
});
test('confirmed POIs also replace matching legacy favorites', () => {
  const groups = repairGroups(initialData), group = groups.find(g => g.stop.placeId === 'yuyuan')!;
  const poi: Place = { id: 'amap:verified-yuyuan', poiId: 'verified-yuyuan', provider: 'amap', coordinateSystem: 'GCJ-02', name: '上海豫园', address: '高德地址', lng: 121.49, lat: 31.22, category: '风景名胜' };
  const next = applyRepairs(initialData, JSON.stringify(initialData), groups, { [group.key]: poi });
  assert.ok(next.favorites.some(f => f.id === poi.id));
  assert.ok(!next.favorites.some(f => f.id === 'yuyuan'));
  assert.equal(next.favorites.length, initialData.favorites.length);
});
