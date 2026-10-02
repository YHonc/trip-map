import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/lib/data';
import { itineraryLabel, itineraryPrompt, readSchedule, structureItinerary } from '../src/lib/itinerary-format';
import { parsePlannerData, serializePlannerData, validatePlannerData } from '../src/lib/transfer';
import { dayConnections } from '../src/lib/connections';
import { applyRepairs, repairGroups } from '../src/lib/poi-repair';

test('separate explicit old schedule titles without losing original text or mutating the source', () => {
  const original = { name: '14:00–15:45｜车站→酒店｜出站；打车；入住' };
  const next = itineraryLabel(original);
  assert.deepEqual(next, { name: '车站→酒店', startTime: '14:00', endTime: '15:45', notes: `原始安排：${original.name}` });
  assert.equal(original.name, '14:00–15:45｜车站→酒店｜出站；打车；入住');
  assert.equal(itineraryLabel(next), next, 'normalizing twice is stable');
  assert.equal(itineraryLabel({ name: '夜游｜时间待确认' }).name, '夜游｜时间待确认');
  assert.equal(itineraryLabel({ name: '23:00–01:00｜夜游' }).startTime, undefined, 'never guess overnight semantics');
});
test('schedules round-trip and old transfers migrate to notes without implicit roads', () => {
  const data = structuredClone(initialData), day = data.trip.days[0];
  Object.assign(day, { notes: '须确认夜场', startTime: '14:00' });
  Object.assign(day.routes[0], { startTime: '23:00', endTime: '01:00', endDayOffset: 1, notes: '预留排队' });
  Object.assign(day.routes[0].stops[0], { startTime: '23:10', endTime: '23:40', notes: '停留半小时' });
  day.transfers = [{ fromRouteId: day.routes[0].id, toRouteId: day.routes[1].id, enabled: false, mode: 'walking', startTime: '01:10', notes: '自行安排' }];
  const normalized = structureItinerary(data);
  assert.deepEqual(parsePlannerData(serializePlannerData(data)).data, normalized);
  assert.deepEqual(dayConnections(data.trip.days[0]), []);
  assert.equal(normalized.trip.days[0].transfers, undefined);
  assert.match(normalized.trip.days[0].notes!, /自行安排/);
  assert.match(normalized.trip.days[0].notes!, /01:10/);
  assert.deepEqual(parsePlannerData(serializePlannerData(initialData)).data, initialData);
  assert.deepEqual(structureItinerary(normalized), normalized);
});
test('invalid planned times are rejected rather than silently interpreted', () => {
  for (const value of [{ startTime: '24:00' }, { startTime: '9:10' }, { endTime: '12:60' }, { startTime: '23:00', endTime: '01:00' }, { endDayOffset: 1 }, { endDayOffset: 2 }, { notes: 'a'.repeat(2001) }]) assert.throws(() => readSchedule(value, 'test'));
  assert.deepEqual(readSchedule({ startTime: '', endTime: null, notes: '' }, 'test'), {});
});
test('invalid legacy references are removed with warnings and valid arrangements become notes', () => {
  const data = structuredClone(initialData), day = data.trip.days[0];
  const valid = { fromRouteId: day.routes[0].id, toRouteId: day.routes[1].id, enabled: true, mode: 'walking' as const };
  day.transfers = [valid, { ...valid }, { ...valid, toRouteId: 'missing' }, { ...valid, toRouteId: valid.fromRouteId }];
  const parsed = validatePlannerData(data);
  assert.equal(parsed.data.trip.days[0].transfers, undefined);
  assert.match(parsed.data.trip.days[0].notes!, /原移动安排/);
  assert.ok(parsed.warnings.some(w => w.includes('转场引用')));
});
test('confirming a place keeps visit times and notes', () => {
  const data = structuredClone(initialData), stop = data.trip.days[0].routes[0].stops[0];
  Object.assign(stop, { notes: '已预约', startTime: '10:00', endTime: '11:00' });
  const group = repairGroups(data).find(g => g.stopIds.includes(stop.id))!;
  const repaired = applyRepairs(data, JSON.stringify(data), [group], { [group.key]: { id: 'confirmed', name: '确认地点', address: '', category: '景点', lng: 118, lat: 24, provider: 'amap', coordinateSystem: 'GCJ-02', poiId: 'verified' } });
  const result = repaired.trip.days[0].routes[0].stops[0];
  assert.equal(result.notes, '已预约'); assert.equal(result.startTime, '10:00'); assert.equal(result.endTime, '11:00');
});
test('the copyable full prompt contains an importable example', () => {
  const json = itineraryPrompt.split('完整示例：\n')[1].split('\n\n我的旅行需求')[0];
  const result = parsePlannerData(json);
  assert.equal(result.data.trip.days[0].transfers, undefined);
  assert.equal(result.data.trip.days[0].routes[0].stops[0].name, '雾灯书屋（桥北店）');
  assert.equal(result.data.trip.days[0].routes[0].stops[0].address, '青帆市桥北路18号');
  assert.equal(result.data.trip.days[0].routes[0].stops[0].startTime, '09:30');
  assert.equal(result.data.trip.days[0].routes[0].stops[0].lng, null);
});
