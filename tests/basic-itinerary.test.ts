import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlannerData, serializePlannerData } from '../src/lib/transfer';
import { validateAIImport } from '../src/lib/ai-import';
import { batchMatchPlaces, matchingPlace, repairGroups } from '../src/lib/poi-repair';
import { routeArrows } from '../src/lib/route-arrows';
import type { Place } from '../src/lib/types';

const compact = () => ({ trip: { name: '虚构纸湾散步', days: [{ routes: [{ mode: 'walking', stops: [
  { name: '纸湾书房（东桥店）', address: '纸湾市东桥路18号', startTime: '09:00', endTime: '09:30' },
  { name: '纸湾书房（西桥店）', address: '纸湾市西桥路8号' },
  { name: '纸湾书房（东桥店）', address: '纸湾市东桥路18号', startTime: '12:00', notes: '第二次到访' },
] }] }] } });
const poi = (name: string, address: string, id: string): Place => ({ id: `amap:${id}`, poiId: id, provider: 'amap', coordinateSystem: 'GCJ-02', name, address, category: '书店', lng: 110, lat: 30 });

test('minimal input fills metadata and preserves distinct visits and separate addresses', () => {
  const data = validatePlannerData(compact()).data;
  assert.equal(data.trip.days[0].date, '');
  assert.deepEqual(data.favorites, []);
  const stops = data.trip.days[0].routes[0].stops;
  assert.equal(stops[0].lng, null);
  assert.equal(stops[0].name, '纸湾书房（东桥店）');
  assert.equal(stops[0].address, '纸湾市东桥路18号');
  assert.equal(new Set(stops.map(s => s.id)).size, 3);
  assert.deepEqual(stops.map(s => s.order), [0, 1, 2]);
  assert.deepEqual(validatePlannerData(JSON.parse(serializePlannerData(data))).data, data);
});
test('generated IDs avoid explicit IDs and drag/drop derivatives without changing originals', () => {
  const input = compact() as any;
  input.trip.days[0].routes[0].stops[1].id = 'import-stop-1-1-1';
  input.trip.days[0].routes[0].stops[2].id = 'route-drop-import-route-1-1';
  const data = validatePlannerData(input).data;
  const route = data.trip.days[0].routes[0];
  assert.notEqual(route.stops[0].id, route.stops[1].id);
  assert.equal(route.stops[1].id, 'import-stop-1-1-1');
  assert.notEqual(`route-drop-${route.id}`, route.stops[2].id);
});
test('AI name/address cleanup is applied while identity, coordinates and visit time survive', () => {
  const source = validatePlannerData(compact()).data;
  const old = source.trip.days[0].routes[0].stops[0];
  old.name += ' 纸湾市东桥路18号'; old.address = ''; old.lng = 110; old.lat = 30;
  const candidate = structuredClone(source), stop = candidate.trip.days[0].routes[0].stops[0];
  stop.name = '纸湾书房（东桥店）'; stop.address = '纸湾市东桥路18号'; stop.lng = null; stop.lat = null;
  const result = validateAIImport(JSON.stringify(candidate), source).data.trip.days[0].routes[0].stops[0];
  assert.equal(result.name, stop.name); assert.equal(result.address, stop.address);
  assert.equal(result.id, old.id); assert.equal(result.placeId, old.placeId); assert.equal(result.lng, 110); assert.equal(result.startTime, '09:00');
  assert.match(result.notes!, /原地点/);
});
test('batch matching deduplicates repeat visits, rejects ambiguity and preserves visits', async () => {
  const data = validatePlannerData(compact()).data, before = JSON.stringify(data);
  let calls = 0;
  const result = await batchMatchPlaces(data, async query => {
    calls++;
    if (query.includes('东桥店')) return [poi('纸湾书房（东桥店）', '纸湾市东桥路18号', 'east'), poi('纸湾书房（西桥店）', '纸湾市西桥路8号', 'west')];
    return [poi('纸湾书房（西桥店）', '纸湾市西桥路8号', 'west1'), poi('纸湾书房（西桥店）', '纸湾市西桥路8号', 'west2')];
  }, () => true);
  assert.equal(calls, 2); assert.equal(result.matched, 2); assert.equal(result.remaining, 1);
  const stops = result.data.trip.days[0].routes[0].stops;
  assert.equal(stops[0].placeId, stops[2].placeId); assert.notEqual(stops[0].id, stops[2].id);
  assert.equal(stops[2].startTime, '12:00'); assert.equal(stops[2].notes, '第二次到访');
  assert.equal(stops[1].lng, null); assert.equal(JSON.stringify(data), before);
  const group = repairGroups(data)[0];
  assert.equal(matchingPlace(group, [poi(group.stop.name, '纸湾市东桥路19号', 'wrong')]), undefined);
});
test('batch errors are isolated, long search input is bounded, and stale work cannot apply', async () => {
  const data = validatePlannerData(compact()).data;
  data.trip.days[0].routes[0].stops[0].address = '很长的虚构地址'.repeat(40);
  const result = await batchMatchPlaces(data, async query => { assert.ok(query.length <= 100); throw new Error('fixture offline'); }, () => true);
  assert.equal(result.matched, 0); assert.equal(result.remaining, 3); assert.equal(result.errors.length, 3);
  let current = true;
  await assert.rejects(batchMatchPlaces(data, async () => { current = false; return []; }, () => current), /取消/);
});
test('arrows follow direction on bends and remain bounded with repeated vertices', () => {
  const arrows = routeArrows([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }], 80);
  assert.deepEqual(arrows, [{ x: 40, y: 0, angle: 0 }, { x: 80, y: 40, angle: 90 }]);
  assert.equal(routeArrows([{ x: 0, y: 0 }, { x: 0, y: 0 }]).length, 0);
});
