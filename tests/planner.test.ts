import assert from 'node:assert/strict';
import test from 'node:test';
import { initialData, places } from '../src/lib/data';
import { insertPlace, moveStop, newRoute, reorder, updateRoute } from '../src/lib/planner';
import { buildMockRoute, mockSearchPlaces } from '../src/services/map-service';
import { dayStopOffset } from '../src/lib/planner';
import { project, type Point } from '../src/lib/map-geometry';
import { isRiver, routableStreets } from '../src/lib/street-network';
test('insertion creates a unique stop, preserves favorite, and normalizes order', () => {
  const result = insertPlace(initialData, 'route-1', places[3], 2);
  const stops = result.trip.days[0].routes[0].stops;
  assert.deepEqual(
    stops.map((s) => s.name),
    ['酒店', '上海外滩', '豫园', '南京东路'],
  );
  assert.deepEqual(
    stops.map((s) => s.order),
    [0, 1, 2, 3],
  );
  assert.notEqual(stops[2].id, places[3].id);
  assert.equal(initialData.trip.days[0].routes[0].stops.length, 3);
});
test('same-route movement adjusts insertion boundary without duplicating stop', () => {
  const result = moveStop(initialData, 'route-1', 'route-1', 'r1-hotel', 3);
  assert.deepEqual(
    result.trip.days[0].routes[0].stops.map((s) => s.name),
    ['上海外滩', '南京东路', '酒店'],
  );
});
test('cross-route movement normalizes source and destination order', () => {
  const result = moveStop(initialData, 'route-1', 'route-2', 'r1-hotel', 1);
  assert.deepEqual(
    result.trip.days[0].routes.map((r) => r.stops.map((s) => s.order)),
    [
      [0, 1],
      [0, 1, 2],
    ],
  );
  assert.equal(result.trip.days[0].routes[1].stops[1].id, 'r1-hotel');
});
test('invalid drop target cannot delete source stop', () => {
  assert.equal(moveStop(initialData, 'route-1', 'missing', 'r1-hotel', 0), initialData);
});
test('route editing and ordering retain their contents', () => {
  const result = updateRoute(initialData, 'route-1', (r) => ({ ...r, visible: false }));
  assert.equal(result.trip.days[0].routes[0].visible, false);
  assert.equal(result.trip.days[0].routes[0].stops.length, 3);
  assert.equal(reorder(initialData.trip.days, 0, 2)[2].id, 'day-1');
  assert.deepEqual(newRoute('#000').stops, []);
});
test('mock search handles names, addresses, and empty queries', async () => {
  assert.equal((await mockSearchPlaces('上海外滩')).length, 3);
  assert.equal((await mockSearchPlaces('武康'))[0].id, 'wukang');
  assert.equal((await mockSearchPlaces('人民大道'))[0].id, 'museum');
  assert.deepEqual(await mockSearchPlaces(''), []);
});
test('route geometry follows stop order and supports empty/single-stop routes', () => {
  assert.equal(buildMockRoute([]).path.length, 0);
  assert.equal(buildMockRoute([places[0]]).distance, 0);
  const forward = buildMockRoute([places[0], places[1]]);
  const reverse = buildMockRoute([places[1], places[0]]);
  assert.equal(forward.path[0].lng, reverse.path.at(-1)!.lng);
  assert.ok(forward.distance > 0);
});

test('day numbering spans routes, retains hidden numbers, and follows edits', () => {
  const day = initialData.trip.days[0];
  assert.equal(dayStopOffset(day, day.routes[1].id), 3);
  const hidden = { ...day, routes: day.routes.map((r, i) => i === 0 ? { ...r, visible: false } : r) };
  assert.equal(dayStopOffset(hidden, day.routes[1].id), 3);
  const moved = moveStop(initialData, 'route-1', 'route-2', 'r1-hotel', 1).trip.days[0];
  assert.equal(dayStopOffset(moved, 'route-2'), 2);
  assert.equal(dayStopOffset({ ...day, routes: [...day.routes].reverse() }, 'route-1'), 2);
  assert.equal(dayStopOffset({ ...day, routes: [{ ...day.routes[0], stops: [] }, day.routes[1]] }, 'route-2'), 0);
});

function onSegment(p: Point, a: Point, b: Point) {
  const length = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.abs(Math.hypot(p.x - a.x, p.y - a.y) + Math.hypot(p.x - b.x, p.y - b.y) - length) < 0.001;
}
test('route interiors stay on drawn roads and cross the river only on bridges', () => {
  let crossings = 0;
  for (let a = 0; a < places.length; a++) for (let b = a + 1; b < places.length; b++) {
    const path = buildMockRoute([places[a], places[b]]).path.map(project);
    assert.ok(path.length >= 2);
    // First/last segments are short access links from the actual place to the street.
    for (let i = 2; i < path.length - 1; i++) {
      const start = path[i - 1], end = path[i];
      const edge = routableStreets.find((e) => onSegment(start, e.start, e.end) && onSegment(end, e.start, e.end));
      assert.ok(edge, `off-road segment: ${places[a].name} → ${places[b].name}`);
      for (let t = 0; t <= 1; t += 0.1) {
        if (isRiver({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })) {
          assert.equal(edge.kind, 'bridge');
          crossings++;
        }
      }
    }
  }
  assert.ok(crossings > 0, 'cross-bank trips must exercise a bridge');
});
