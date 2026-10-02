import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVisits, calculationSignature, calculatedTime, departureTime, stayMinutes } from '../src/lib/itinerary-calculation';
import { connectedRoutes, setStopVisibility } from '../src/lib/connected-routes';
import { validatePlannerData } from '../src/lib/transfer';
import { buildMockRoute } from '../src/services/map-service';
import type { PlannerData, RouteResult } from '../src/lib/types';

function fixture(): PlannerData {
  return validatePlannerData({ trip: { id: 'schedule-trip', name: '时间测试', days: [{ id: 'd', name: '第一天', date: '', departureTime: '23:20', routes: [
    { id: 'r', name: '步行', mode: 'walking', stops: [
      { id: 'a', name: '书房', address: '', lng: 121.47, lat: 31.24, stayMinutes: 30 },
      { id: 'b', name: '展馆', address: '', lng: 121.48, lat: 31.25, stayMinutes: 45 },
    ] },
    { id: 's', name: '骑行', mode: 'riding', stops: [{ id: 'c', name: '公园', address: '', lng: 121.49, lat: 31.24, stayMinutes: 15 }] },
  ] }] }, favorites: [] }).data;
}
const result = (durations: number[]): RouteResult => ({ status: 'ready', geometry: { distance: durations.length * 1000, duration: durations.reduce((n, d) => n + d, 0), path: [], legs: durations.map(duration => ({ duration, distance: 1000 })) } });
test('local schedule includes every adjacent leg, mode group boundary, stays and midnight', () => {
  const data = fixture();
  const visits = calculateVisits(data, { r: result([601]), s: result([300]) });
  assert.deepEqual(visits, { a: { arrival: 1400, departure: 1430 }, b: { arrival: 1441, departure: 1486 }, c: { arrival: 1491, departure: 1506 } });
  assert.equal(calculatedTime(visits.b.arrival), '次日 00:01');
  assert.equal(calculatedTime(2885), '第 3 天 00:05');
  assert.equal(data.trip.days[0].routes[0].stops[0].startTime, undefined);
});
test('a failed or missing leg never implies a zero-minute journey downstream', () => {
  const visits = calculateVisits(fixture(), { r: { status: 'error' }, s: result([300]) });
  assert.deepEqual(Object.keys(visits), ['a']);
});
test('stay duration preserves imported intervals and allows explicit zero, defaulting to thirty', () => {
  assert.equal(stayMinutes({ startTime: '14:00', endTime: '14:25' }), 25);
  assert.equal(stayMinutes({ startTime: '23:50', endTime: '00:10', endDayOffset: 1 }), 20);
  assert.equal(stayMinutes({ stayMinutes: 0, startTime: '09:00', endTime: '10:00' }), 0);
  assert.equal(stayMinutes({}), 30);
});
test('calculation becomes stale only when schedule inputs change, including order, mode, stay and start', () => {
  const data = fixture(), original = calculationSignature(data), copy = structuredClone(data);
  copy.trip.days[0].routes[0].stops[0].name = '更名';
  copy.trip.days[0].routes[0].stops[0].notes = '备注';
  assert.equal(calculationSignature(copy), original);
  for (const edit of [
    (p: PlannerData) => p.trip.days[0].routes[0].stops.reverse(),
    (p: PlannerData) => { p.trip.days[0].routes[0].mode = 'driving'; },
    (p: PlannerData) => { p.trip.days[0].routes[0].stops[0].stayMinutes = 60; },
    (p: PlannerData) => { p.trip.days[0].departureTime = '10:00'; },
  ]) { const changed = structuredClone(data); edit(changed); assert.notEqual(calculationSignature(changed), original); }
});
test('derived start time does not change when imported cards are reordered', () => {
  const day = fixture().trip.days[0]; delete day.departureTime;
  day.routes[0].stops[0].startTime = '14:00'; day.routes[0].stops[1].startTime = '19:30';
  assert.equal(departureTime(day), '14:00'); day.routes[0].stops.reverse(); assert.equal(departureTime(day), '14:00');
});
test('stay and departure persist through validation and reject malformed values', () => {
  const data = fixture(); assert.deepEqual(validatePlannerData(data).data, data);
  for (const value of [-1, 1441, 2.5, '30']) {
    const changed = structuredClone(data); changed.trip.days[0].routes[0].stops[0].stayMinutes = value as number;
    assert.throws(() => validatePlannerData(changed));
  }
  data.trip.days[0].departureTime = '26:00'; assert.throws(() => validatePlannerData(data));
});
test('individual visibility splits a group without hiding neighbors or losing visit data', () => {
  const day = fixture().trip.days[0];
  const hidden = setStopVisibility(day, 'r', 'b', false, ['new-r', 'unused']);
  assert.deepEqual(hidden.routes.map(r => [r.visible, r.stops.map(s => s.id)]), [[true, ['a']], [false, ['b']], [true, ['c']]]);
  assert.equal(hidden.routes[1].stops[0].stayMinutes, 45);
  const shown = setStopVisibility(hidden, 'new-r', 'b', true, ['unused-a', 'unused-b']);
  assert.equal(shown.routes.every(r => r.visible), true);
  assert.deepEqual(connectedRoutes(shown)[2].stops.map(s => s.id), ['b', 'c']);
});
test('mock walking, cycling and driving expose correct per-pair duration totals', () => {
  const stops = [{ lng:121.47,lat:31.24 },{ lng:121.48,lat:31.25 },{ lng:121.48,lat:31.25 }];
  const routes = [4.5,14,28].map(speed => buildMockRoute(stops,speed));
  assert.ok(routes[0].duration > routes[1].duration && routes[1].duration > routes[2].duration);
  for (const route of routes) {
    assert.equal(route.legs?.length, 2);
    assert.deepEqual(route.legs?.[1], { distance: 0, duration: 0 });
    assert.equal(route.legs!.reduce((sum, leg) => sum + leg.duration, 0), route.duration);
  }
});
