import test from 'node:test';
import assert from 'node:assert/strict';
import { minimumPan, popupMaxHeight, type Rect } from '../src/lib/map-geometry';
import { panMapContents } from '../src/services/map-pan';
import type { AMapInstance, AMapSDK } from '../src/services/amap-sdk';

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
test('reveal uses a diagonal free region among search, tools, and expanded favorites', () => {
  const bounds = { x: 14, y: 14, width: 640, height: 760 };
  const obstacles = [
    { x: 14, y: 14, width: 640, height: 65 },
    { x: 390, y: 84, width: 264, height: 250 },
    { x: 14, y: 470, width: 640, height: 304 },
    { x: 595, y: 360, width: 50, height: 100 },
  ];
  const rect = { x: 420, y: 440, width: 240, height: 220 };
  const delta = minimumPan(rect, bounds, obstacles);
  const moved = { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
  assert.ok(delta.x < 0 && delta.y < 0);
  assert.ok(obstacles.every(o => !overlap(moved, o)));
  assert.deepEqual(minimumPan(moved, bounds, obstacles), { x: 0, y: 0 });
  assert.ok(moved.x >= bounds.x && moved.y >= bounds.y);
});
test('popup height limits long content to space above favorites and below search', () => {
  const bounds = { x: 14, y: 14, width: 600, height: 700 };
  const obstacles = [{ x: 0, y: 0, width: 650, height: 80 }, { x: 0, y: 450, width: 650, height: 400 }];
  const height = popupMaxHeight(240, bounds, obstacles, 46);
  assert.equal(height, 314);
  const rect = { x: 200, y: 100, width: 240, height: height + 46 };
  const delta = minimumPan(rect, bounds, obstacles);
  assert.ok(obstacles.every(o => !overlap({ ...rect, x: rect.x + delta.x, y: rect.y + delta.y }, o)));
});
test('map pan moves geographic contents in requested direction with explicit animation', () => {
  let center = { lng: 120, lat: 30 };
  const calls: unknown[][] = [];
  const map = {
    getCenter: () => center,
    lngLatToContainer: (p: number[]) => ({ x: 400 + (p[0] - center.lng) * 100, y: 300 - (p[1] - center.lat) * 100 }),
    containerToLngLat: (p: { x: number; y: number }) => ({ lng: center.lng + (p.x - 400) / 100, lat: center.lat - (p.y - 300) / 100 }),
    setCenter: (p: number[], immediate: boolean, duration: number) => { calls.push([p, immediate, duration]); center = { lng: p[0], lat: p[1] }; },
  } as unknown as AMapInstance;
  const sdk = { Pixel: class { constructor(public x: number, public y: number) {} } } as unknown as AMapSDK;
  panMapContents(map, sdk, { x: 100, y: -50 }, 320);
  assert.deepEqual(map.lngLatToContainer([120, 30]), { x: 500, y: 250 });
  assert.deepEqual(calls[0], [[119, 29.5], false, 320]);
  panMapContents(map, sdk, { x: -100, y: 50 });
  assert.deepEqual(calls[1], [[120, 30], true, 0]);
});
