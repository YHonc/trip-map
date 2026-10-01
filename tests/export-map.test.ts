import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initialData } from '../src/lib/data';
import { createRouteMapSvg } from '../src/lib/export';
import { exportViewport, exportMapPoint } from '../src/lib/export-map';
import { colorImportedDays, importedDayColor } from '../src/lib/import-colors';
import { parsePlannerData, serializePlannerData } from '../src/lib/transfer';
import { staticMapAmap } from '../src/services/server/static-map';
import { GET } from '../src/app/api/amap/static-map/route';
import type { RouteResult } from '../src/lib/types';
import { hasCoordinates } from '../src/lib/location';

test('import gives days distinct colors, keeps route colors in sync and does not mutate backups', () => {
  const source = structuredClone(initialData);
  source.trip.days.forEach(day => { day.color = '#aaa'; day.routes.forEach(route => route.color = '#aaa'); });
  const before = serializePlannerData(source), result = colorImportedDays(source);
  assert.equal(new Set(result.trip.days.map(day => day.color)).size, result.trip.days.length);
  result.trip.days.forEach(day => day.routes.forEach(route => assert.equal(route.color, day.color)));
  assert.equal(serializePlannerData(source), before);
  assert.deepEqual(parsePlannerData(before).data, source, 'normal persistence must not recolor saved data');
  assert.deepEqual(colorImportedDays(result), result);
  const palette = Array.from({ length: 100 }, (_, i) => importedDayColor(i));
  assert.equal(new Set(palette).size, 100);
  assert.ok(palette.every(color => /^#[0-9a-f]{6}$/.test(color)));
});

test('export projection places the center correctly and fits all days, hidden routes and road detours', () => {
  const data = structuredClone(initialData);
  data.trip.days[0].routes[0].visible = false;
  const detour = { lng: 121.8, lat: 31.6 };
  const results: Record<string, RouteResult> = { [data.trip.days[0].routes[0].id]: { status: 'ready', geometry: { path: [detour], connectors: [[{ lng: 121.1, lat: 31.0 }]], distance: 0, duration: 0 } } };
  const viewport = exportViewport(data, results);
  assert.deepEqual(exportMapPoint(viewport.center, viewport), { x: 800, y: 425 });
  const points = [...data.trip.days.flatMap(d => d.routes.flatMap(r => r.stops)), detour, { lng: 121.1, lat: 31 }];
  for (const point of points) { assert.ok(hasCoordinates(point)); const pixel = exportMapPoint(point, viewport); assert.ok(pixel.x > 200 && pixel.x < 1400 && pixel.y > 70 && pixel.y < 780); }
  // One degree at the equator has a known Web Mercator pixel span.
  assert.ok(Math.abs(exportMapPoint({ lng: 1, lat: 0 }, { center: { lng: 0, lat: 0 }, zoom: 8 }).x - 800 - 262144 / 360) < 1e-8);
  const reference = exportMapPoint({ lng: 121.047504, lat: 29.170432 }, { center: { lng: 121.008734, lat: 28.920786 }, zoom: 9 });
  assert.ok(Math.abs(reference.x - 856) < 2 && Math.abs(reference.y - 9) < 3, 'known POI aligns with the real static-map calibration image');
});

test('an empty itinerary uses its city or national overview', () => {
  const data = structuredClone(initialData); data.trip.days.forEach(day => day.routes = []);
  assert.deepEqual(exportViewport(data), { center: { lng: 104.2, lat: 35.8 }, zoom: 3 });
  data.trip.days[0].city = { name: '厦门市', lng: 118.0894, lat: 24.4798, adcode: '350200', provider: 'amap', coordinateSystem: 'GCJ-02' };
  assert.equal(exportViewport(data).center.lng, 118.0894);
});

test('SVG embeds the basemap for offline viewing and retains vector routes and attribution', () => {
  const viewport = exportViewport(initialData), dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const svg = createRouteMapSvg(initialData, { ...viewport, dataUrl });
  assert.ok(svg.includes(`<image width="1600" height="850" href="${dataUrl}"/>`));
  assert.ok(svg.includes('底图 © 高德地图'));
  assert.ok(svg.includes('武康路'));
  assert.ok(!svg.includes('不含高德底图'));
  assert.throws(() => createRouteMapSvg(initialData, { ...viewport, dataUrl: 'https://example.com/map?key=secret' }), /格式无效/);
});

test('static map endpoint rejects bad parameters and foreign origins before upstream work', async () => {
  const base = 'http://127.0.0.1:3000/api/amap/static-map';
  for (const query of ['', 'lng=118&lat=24&zoom=17', 'lng=NaN&lat=24&zoom=10', 'lng=118&lat=24&zoom=10&url=https://example.com', 'lng=118&lat=24&zoom=']) {
    assert.equal((await GET(new Request(`${base}?${query}`, { headers: { host: '127.0.0.1:3000' } }))).status, 400);
  }
  assert.equal((await GET(new Request(`${base}?lng=118&lat=24&zoom=10`, { headers: { host: '127.0.0.1:3000', origin: 'https://example.com' } }))).status, 403);
});

test('static map uses fixed image dimensions, keeps keys server-side and rejects upstream failures', async () => {
  const previous = { data: process.env.TRIP_MAP_DATA_DIR, key: process.env.AMAP_WEB_KEY };
  process.env.TRIP_MAP_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'trip-map-static-test-'));
  process.env.AMAP_WEB_KEY = 'fixture-static-key';
  const viewport = { center: { lng: 118.0894, lat: 24.4798 }, zoom: 12 };
  const header = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a', 'hex').copy(header); header.writeUInt32BE(1600, 16); header.writeUInt32BE(850, 20);
  try {
    const result = await staticMapAmap(viewport, async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/v3/staticmap'); assert.equal(url.searchParams.get('size'), '800*425'); assert.equal(url.searchParams.get('scale'), '2');
      assert.equal(url.searchParams.get('location'), '118.089400,24.479800'); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
      return new Response(header);
    });
    assert.equal(result, `data:image/png;base64,${header.toString('base64')}`);
    await assert.rejects(staticMapAmap(viewport, async () => Response.json({ status: '0', info: 'INVALID_USER_KEY' })), /静态地图权限与额度/);
    const wrongSize = Buffer.from(header); wrongSize.writeUInt32BE(800, 16);
    await assert.rejects(staticMapAmap(viewport, async () => new Response(wrongSize)), /尺寸/);
    await assert.rejects(staticMapAmap(viewport, async () => new Response(header, { headers: { 'content-length': '99999999' } })), /过大/);
    await assert.rejects(staticMapAmap(viewport, async () => { throw new Error('URL containing fixture-static-key'); }), error => error instanceof Error && !error.message.includes('fixture-static-key'));
  } finally {
    if (previous.data === undefined) delete process.env.TRIP_MAP_DATA_DIR; else process.env.TRIP_MAP_DATA_DIR = previous.data;
    if (previous.key === undefined) delete process.env.AMAP_WEB_KEY; else process.env.AMAP_WEB_KEY = previous.key;
  }
});
