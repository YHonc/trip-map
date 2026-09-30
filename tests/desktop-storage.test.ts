import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadLibrary, saveLibrary, LibraryConflict } from '../src/services/server/plan-store';
import { cachedMap, clearMapCache, cacheStats } from '../src/services/server/map-cache';
import { readMapConfig, publicMapConfig, saveMapConfig } from '../src/services/server/map-config';
import { defaultCachePolicy } from '../src/lib/map-config';
import { initialData } from '../src/lib/data';
import { database } from '../src/services/server/database';
const root = mkdtempSync(path.join(tmpdir(), 'trip-map-storage-fixture-'));
process.env.TRIP_MAP_DATA_DIR = root;
process.env.TRIP_MAP_LEGACY_DIR = root;
const config = { provider: 'amap' as const, jsKey: 'fixture', webKey: 'fixture', securityCode: 'fixture', baseURL: 'https://example.invalid', revision: 'fixture', cache: structuredClone(defaultCachePolicy) };
const child = (mode: string) => {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'tests/fixtures/storage-child.ts', mode], { env: { ...process.env }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
test('SQLite library persists across processes and rejects stale writers without overwriting', () => {
  assert.equal(loadLibrary().revision, 0);
  const first = saveLibrary({ revision: 0, currentId: initialData.trip.id, plans: [initialData] });
  assert.equal(child('plans').plans[0].trip.name, initialData.trip.name);
  const changed = structuredClone(initialData); changed.trip.name = 'SQLite saved';
  const next = saveLibrary({ ...first, plans: [changed] });
  assert.throws(() => saveLibrary(first), LibraryConflict);
  assert.equal(loadLibrary().plans[0].trip.name, 'SQLite saved');
  assert.equal(saveLibrary(next).revision, next.revision);
  assert.equal((database('data.sqlite').prepare('SELECT COUNT(*) AS n FROM backups').get() as { n: number }).n, 1);
});
test('disk cache serves a fresh process without an upstream call and survives cache clearing independently of plans', async () => {
  await cachedMap('city', ['restart'], config, async () => [{ name: 'fixture-city' }]);
  assert.deepEqual(child('cache'), [{ name: 'fixture-city' }]);
  assert.ok(cacheStats().counters.disk >= 1);
  clearMapCache();
  assert.equal(cacheStats().groups.length, 0);
  assert.equal(loadLibrary().plans[0].trip.name, 'SQLite saved');
});
test('cache expiration, configuration namespace, direction and errors never reuse incompatible results', async () => {
  let calls = 0;
  const run = async () => ({ count: ++calls });
  const short = { ...config, cache: { ...config.cache, ttl: { ...config.cache.ttl, walking: 0.0001 } } };
  await cachedMap('walking', ['a', 'b'], short, run);
  await new Promise(resolve => setTimeout(resolve, 12));
  await cachedMap('walking', ['a', 'b'], short, run);
  await cachedMap('walking', ['b', 'a'], config, run);
  await cachedMap('walking', ['a', 'b'], { ...config, revision: 'different-provider-config' }, run);
  assert.equal(calls, 4);
  await assert.rejects(cachedMap('city', ['failure'], config, async () => { throw new Error('quota'); }));
  await cachedMap('city', ['failure'], config, run);
  assert.equal(calls, 5);
});
test('concurrent misses merge; clear during a request prevents late repopulation', async () => {
  clearMapCache();
  let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const run = async () => { calls++; await gate; return { ok: true }; };
  const a = cachedMap('search', ['pending'], config, run);
  const b = cachedMap('search', ['pending'], config, run);
  clearMapCache(); release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(cacheStats().groups.length, 0);
});
test('capacity evicts old entries; disabled persistence does not populate disk', async () => {
  clearMapCache();
  const small = { ...config, cache: { ...config.cache, maxMB: 0.0004 } };
  for (let n = 0; n < 6; n++) await cachedMap('search', [n], small, async () => ({ text: 'x'.repeat(150) }));
  const usage = database('map-cache.sqlite').prepare('SELECT SUM(bytes) AS bytes FROM entries').get() as { bytes: number };
  assert.ok(usage.bytes <= 0.0004 * 1024 * 1024);
  clearMapCache();
  await cachedMap('city', ['off'], { ...config, cache: { ...config.cache, enabled: false } }, async () => ['ok']);
  assert.equal(cacheStats().groups.length, 0);
});
test('map configuration is runtime, secret-safe, revision checked and clears credentials on gateway change', () => {
  const before = publicMapConfig();
  const saved = saveMapConfig({ ...before, provider: 'amap', jsKey: 'test-js', webKey: 'test-web-secret', securityCode: 'test-security-secret' });
  assert.equal(saved.hasWebKey, true);
  assert.equal('webKey' in saved, false);
  assert.equal(readMapConfig().webKey, 'test-web-secret');
  if (process.platform === 'win32') {
    const file = readFileSync(path.join(root, 'map-config.json'), 'utf8');
    assert.ok(!file.includes('test-web-secret') && !file.includes('test-security-secret'));
    assert.ok(file.includes('dpapi:'));
  }
  assert.throws(() => saveMapConfig(before), /其他窗口/);
  const changed = saveMapConfig({ ...saved, baseURL: 'http://127.0.0.1:49876', webKey: '' });
  assert.equal(changed.hasWebKey, false);
  assert.notEqual(changed.revision, saved.revision);
});
