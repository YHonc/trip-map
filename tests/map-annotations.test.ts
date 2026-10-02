import test from 'node:test';
import assert from 'node:assert/strict';
import { ANNOTATION_COLORS, annotationKey, parseAnnotations, readAnnotations, saveAnnotations, type MapAnnotation } from '../src/lib/map-annotations';
import { fromScreen, toScreen } from '../src/lib/map-geometry';
import { annotationAction, annotationHit } from '../src/lib/annotation-gesture';

const line: MapAnnotation = { id: 'fixture-pen', kind: 'pen', color: ANNOTATION_COLORS[0], points: [{ lng: 121.47, lat: 31.24 }, { lng: 121.48, lat: 31.25 }] };
test('mouse buttons temporarily override each selected annotation tool', () => {
  for (const tool of ['pen', 'ellipse', 'pan', 'erase'] as const) {
    assert.equal(annotationAction(0, tool), tool);
    assert.equal(annotationAction(1, tool), 'erase');
    assert.equal(annotationAction(2, tool), 'pan');
    assert.equal(annotationAction(3, tool), null);
  }
});
test('eraser catches swept crossings but leaves nearby unrelated lines and circle interiors', () => {
  const project = (p: { lng: number; lat: number }) => ({ x: p.lng, y: p.lat });
  const stroke = { ...line, points: [{ lng: 0, lat: 50 }, { lng: 100, lat: 50 }] };
  assert.equal(annotationHit(stroke, { x: 50, y: 0 }, { x: 50, y: 100 }, project), true);
  assert.equal(annotationHit(stroke, { x: 30, y: 58 }, { x: 30, y: 58 }, project), true);
  assert.equal(annotationHit(stroke, { x: 130, y: 0 }, { x: 130, y: 100 }, project), false);
  const circle = { ...stroke, kind: 'ellipse' as const, points: [{ lng: 0, lat: 0 }, { lng: 100, lat: 100 }] };
  assert.equal(annotationHit(circle, { x: 50, y: 50 }, { x: 55, y: 55 }, project), false);
  assert.equal(annotationHit(circle, { x: 90, y: 50 }, { x: 120, y: 50 }, project), true);
});
test('annotation projection round-trips across narrow/wide viewports and zoom/pan', () => {
  for (const size of [{ width: 480, height: 800 }, { width: 1400, height: 650 }]) {
    for (const camera of [{ x: 0, y: 0, scale: 1 }, { x: -90, y: 75, scale: 2.3 }]) {
      for (const coordinate of line.points) {
        const actual = fromScreen(toScreen(coordinate, camera, size), camera, size);
        assert.ok(Math.abs(actual.lng - coordinate.lng) < 1e-10);
        assert.ok(Math.abs(actual.lat - coordinate.lat) < 1e-10);
      }
    }
  }
});
test('annotation storage survives reopen, separates plans/providers, and removes cleared data', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    assert.equal(saveAnnotations('trip-1', 'amap', [line]), true);
    assert.deepEqual(readAnnotations('trip-1', 'amap'), [line]);
    assert.deepEqual(readAnnotations('trip-2', 'amap'), []);
    assert.deepEqual(readAnnotations('trip-1', 'mock'), []);
    saveAnnotations('trip-2', 'amap', [{ ...line, kind: 'ellipse' }]);
    assert.equal(saveAnnotations('trip-1', 'amap', []), true);
    assert.equal(storage.has(annotationKey('trip-1', 'amap')), false);
    assert.deepEqual(readAnnotations('trip-1', 'amap'), []);
    assert.equal(readAnnotations('trip-2', 'amap').length, 1);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('fixture storage blocked'); } });
    assert.deepEqual(readAnnotations('trip-1', 'amap'), []);
    assert.equal(saveAnnotations('trip-1', 'amap', [line]), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
test('corrupt or oversized saved annotations cannot break the map', () => {
  const parse = (items: unknown[]) => parseAnnotations(JSON.stringify({ version: 1, items }));
  assert.deepEqual(parseAnnotations('{'), []);
  assert.deepEqual(parseAnnotations(JSON.stringify({ version: 9, items: [line] })), []);
  assert.deepEqual(parse([line, line, null, { ...line, id: 'bad', points: [{ lng: 999, lat: 0 }, { lng: 0, lat: 0 }] }, { ...line, id: 'color', color: 'url(https://invalid)' }]), [line]);
  assert.deepEqual(parse([{ ...line, kind: 'ellipse', points: [...line.points, line.points[0]] }]), []);
  assert.equal(parse(Array.from({ length: 100 }, (_, i) => ({ ...line, id: String(i) }))).length, 80);
});
