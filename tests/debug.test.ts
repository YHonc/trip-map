import test from 'node:test';
import assert from 'node:assert/strict';
import { debugParams, clearDebug, enableDebug, recordDebug, debugSnapshot } from '../src/lib/debug';
import { withRequestTrace, markUpstreamRequest } from '../src/services/server/request-trace';
import { RequestCache } from '../src/lib/request-cache';
import { updatePlanLibrary } from '../src/lib/plan-library';
import type { PlannerData } from '../src/lib/types';

test('plan switch preserves current edits, keeps other plans and never duplicates identities', () => {
  const first: PlannerData = { version: 2, trip: { id: 'a', name: 'original', days: [] }, favorites: [] };
  const second: PlannerData = { version: 2, trip: { id: 'b', name: 'other', days: [] }, favorites: [] };
  const edited = { ...first, trip: { ...first.trip, name: 'unsaved edit' } };
  const library = updatePlanLibrary([first, second], edited, second);
  assert.equal(library.length, 2);
  assert.equal(library.find(plan => plan.trip.id === 'a')?.trip.name, 'unsaved edit');
  assert.deepEqual(updatePlanLibrary(library, edited, first).find(plan => plan.trip.id === 'a'), edited);
  assert.equal(first.trip.name, 'original');
});

test('debug export allowlist drops secrets, headers, prompts and nested extra fields', () => {
  const params = debugParams(new URL('http://localhost/api/amap/route?key=SECRET&city=310000'), JSON.stringify({ mode: 'walking', apiKey: 'SECRET', prompt: 'PRIVATE', origin: { lng: 121, lat: 31, key: 'SECRET' }, destination: { lng: 122, lat: 32 } }));
  assert.deepEqual(params, { city: '310000', mode: 'walking', origin: { lng: 121, lat: 31 }, destination: { lng: 122, lat: 32 } });
});
test('debug is opt-in, bounded and clearable', () => {
  clearDebug(); enableDebug(false);
  const entry = { time: 'now', call: 'test', params: {}, duration: 0, status: '成功' };
  recordDebug(entry); assert.equal(debugSnapshot().length, 0);
  enableDebug(true); for (let i = 0; i < 220; i++) recordDebug(entry);
  assert.equal(debugSnapshot().length, 200);
  clearDebug(); enableDebug(false); assert.equal(debugSnapshot().length, 0);
});
test('server tracing isolates concurrent calls and counts shared upstream only once', async () => {
  const cache = new RequestCache<{ ok: boolean }>();
  const handler = withRequestTrace(async () => {
    const value = await cache.get('same', async () => { markUpstreamRequest(); await new Promise(resolve => setTimeout(resolve, 10)); return { ok: true }; });
    return Response.json(value);
  });
  const results = await Promise.all([handler(new Request('http://localhost/')), handler(new Request('http://localhost/'))]);
  assert.equal(results.reduce((sum, result) => sum + Number(result.headers.get('X-Amap-Upstream-Requests')), 0), 1);
  assert.equal((await handler(new Request('http://localhost/'))).headers.get('X-Amap-Upstream-Requests'), '0');
});
