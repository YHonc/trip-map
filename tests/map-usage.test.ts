import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mapUsageDay, mapUsageStats, recordMapUsage } from '../src/services/server/map-usage';
import { database } from '../src/services/server/database';
import { searchAmap, detailAmap, reverseAmap, routeAmap, checkBudget } from '../src/services/server/amap';
import { clearMapCache } from '../src/services/server/map-cache';
import { searchCities } from '../src/services/server/cities';
import { staticMapAmap } from '../src/services/server/static-map';
import { GET as usageGET } from '../src/app/api/amap/usage/route';
import { POST as testPOST } from '../src/app/api/amap/test/route';
import { GET as sdkGET } from '../src/app/%5FAMapService/[...path]/route';
import { publicMapConfig, saveMapConfig } from '../src/services/server/map-config';

beforeEach(() => {
  const root = mkdtempSync(path.join(tmpdir(), 'trip-map-usage-'));
  process.env.TRIP_MAP_DATA_DIR = root;
  process.env.TRIP_MAP_LEGACY_DIR = root;
  process.env.AMAP_WEB_KEY = 'fixture-usage-key';
  process.env.AMAP_SECURITY_CODE = 'fixture-security';
  process.env.NEXT_PUBLIC_AMAP_JS_KEY = 'fixture-js';
});
const request = (pathname: string, init?: RequestInit) => new Request(`http://127.0.0.1:3000${pathname}`, { ...init, headers: { host: '127.0.0.1:3000', ...init?.headers } });
const child = (mode: string) => {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'tests/fixtures/usage-child.ts', mode], { env: { ...process.env }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const attempts = (endpoint: string) => mapUsageStats().endpoints.find(row => row.endpoint === endpoint)?.total;

test('usage is durable, classified, UTC+8 based and never contains request parameters', async () => {
  const before = Date.parse('2026-10-01T15:59:59Z'), after = Date.parse('2026-10-01T16:00:00Z');
  assert.equal(mapUsageDay(before), '2026-10-01'); assert.equal(mapUsageDay(after), '2026-10-02');
  recordMapUsage('search', before); recordMapUsage('search', after); recordMapUsage('staticmap', after);
  const stats = mapUsageStats(after);
  assert.equal(stats.today, 2); assert.equal(stats.total, 3); assert.equal(stats.since, new Date(before).toISOString());
  assert.equal(child('usage').total, 3);
  clearMapCache(); assert.equal(mapUsageStats(after).total, 3);
  const response = await usageGET(request('/api/amap/usage'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const text = await response.text();
  assert.ok(!/fixture-usage-key|fixture-security|fixture-js|https?:|lng|keywords/.test(text));
  assert.equal((await usageGET(request('/api/amap/usage', { headers: { origin: 'https://foreign.invalid' } }))).status, 403);
});

test('concurrent requests and memory/disk cache hits count only the single outbound attempt; disabled cache still counts', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 15)); return Response.json({ status: '1', pois: [] }); };
  try {
    await Promise.all([searchAmap('厦门缓存测试'), searchAmap('厦门缓存测试')]);
    await searchAmap('厦门缓存测试');
    assert.equal(calls, 1); assert.equal(attempts('search'), 1);
    assert.equal(child('cache').total, 1);
    const config = publicMapConfig(); saveMapConfig({ ...config, cache: { ...config.cache, enabled: false } });
    await searchAmap('不保留缓存'); await searchAmap('不保留缓存');
    assert.equal(attempts('search'), 3);
  } finally { globalThis.fetch = original; }
});

test('validation and missing keys do not count; network, HTTP and business failures each count an attempt', async () => {
  let calls = 0;
  const network: typeof fetch = async () => { calls++; throw new Error('offline'); };
  assert.throws(() => searchAmap('', network));
  assert.throws(() => detailAmap('../bad', network));
  process.env.AMAP_WEB_KEY = '';
  await assert.rejects(searchAmap('厦门', network), /未配置/);
  assert.equal(mapUsageStats().total, 0); assert.equal(calls, 0);
  process.env.AMAP_WEB_KEY = 'fixture-usage-key';
  await assert.rejects(searchAmap('厦门', network), /offline/);
  await assert.rejects(searchAmap('厦门', network), /offline/);
  await assert.rejects(searchAmap('厦门', async () => new Response('', { status: 503 })));
  await assert.rejects(searchAmap('厦门', async () => Response.json({ status: '0', infocode: '10003' })));
  assert.equal(attempts('search'), 4);
});

test('detail, address and each travel mode are recorded under separate fixed names', async () => {
  const point = { lng: 118, lat: 24 }, end = { lng: 118.1, lat: 24.1 };
  await detailAmap('B123', async () => Response.json({ status: '1', pois: [{ id: 'B123', name: 'fixture', location: '118,24' }] }));
  await reverseAmap(point, async () => Response.json({ status: '1', regeocode: { formatted_address: 'fixture' } }));
  for (const mode of ['driving', 'walking', 'riding'] as const) {
    const body = { paths: [{ distance: '100', duration: '60', steps: [{ polyline: '118,24;118.1,24.1' }] }] };
    await routeAmap(point, end, mode, async () => Response.json(mode === 'riding' ? { errcode: 0, data: body } : { status: '1', route: body }));
    assert.equal(attempts(mode), 1);
  }
  assert.equal(attempts('detail'), 1); assert.equal(attempts('regeo'), 1); assert.equal(mapUsageStats().total, 5);
});

test('city, static export, connection test and only allowed SDK proxy calls are counted', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ status: '1', districts: [] });
  try {
    await searchCities('厦门');
    assert.equal((await testPOST(request('/api/amap/test', { method: 'POST' }))).status, 200);
    for (const endpoint of ['v3/log/init', 'v4/map/styles']) {
      assert.equal((await sdkGET(request(`/_AMapService/${endpoint}`), { params: Promise.resolve({ path: endpoint.split('/') }) })).status, 200);
    }
    assert.equal((await sdkGET(request('/_AMapService/forbidden'), { params: Promise.resolve({ path: ['forbidden'] }) })).status, 404);
    assert.equal((await sdkGET(request('/_AMapService/v3/log/init?callback=%3Cscript%3E'), { params: Promise.resolve({ path: ['v3', 'log', 'init'] }) })).status, 400);
    const header = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a', 'hex').copy(header); header.writeUInt32BE(1600, 16); header.writeUInt32BE(850, 20);
    await staticMapAmap({ center: { lng: 118, lat: 24 }, zoom: 12 }, async () => new Response(header));
    for (const endpoint of ['city', 'test', 'sdk-init', 'sdk-style', 'staticmap']) assert.equal(attempts(endpoint), 1);
    assert.equal(mapUsageStats().total, 5);
  } finally { globalThis.fetch = original; }
});

test('a telemetry write failure does not prevent the actual request and is reported as a gap', async () => {
  mapUsageStats();
  const db = database('map-usage.sqlite'); db.pragma('query_only = ON');
  try { assert.deepEqual(await searchAmap('厦门', async () => Response.json({ status: '1', pois: [] })), []); }
  finally { db.pragma('query_only = OFF'); }
  assert.equal(mapUsageStats().unrecorded, 1); assert.equal(mapUsageStats().total, 0);
});

test('locally rate-limited requests are rejected before usage is counted', async () => {
  for (let i = 0; i < 130; i++) { try { checkBudget(); } catch { /* exhaust the shared window */ } }
  await assert.rejects(searchAmap('厦门', async () => { throw new Error('must not send'); }), /频繁/);
  assert.equal(mapUsageStats().total, 0);
});
