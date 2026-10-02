import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initialData, COLORS } from '../src/lib/data';
import { importedDayColor } from '../src/lib/import-colors';
import { routeLineStyle } from '../src/lib/route-style';
import { DEFAULT_TRAVEL_PROMPT, optimizationMessages, OPTIMIZATION_RULES } from '../src/lib/ai-prompt';
import { decodeReferenceFile, MAX_REFERENCE_CONTEXT, referenceExcerpts, type TravelReference } from '../src/lib/travel-references';
import { readTravelPrompt, saveTravelPrompt } from '../src/services/server/ai-prompt';
import { loadLibrary, saveLibrary } from '../src/services/server/plan-store';
import { addReference, deleteReference, getReference, listReferences, selectedReferences } from '../src/services/server/reference-store';
import { writeConfigFile, readConfigFile } from '../src/services/server/config-file';
import { GET as list, POST as upload } from '../src/app/api/ai/references/route';
import { POST as optimize } from '../src/app/api/ai/optimize/route';
import { POST as savePromptAPI } from '../src/app/api/ai/prompt/route';

beforeEach(() => {
  const root = mkdtempSync(path.join(tmpdir(), 'trip-map-ai-references-'));
  process.env.TRIP_MAP_DATA_DIR = root; process.env.TRIP_MAP_LEGACY_DIR = root;
});
function library() {
  const a = structuredClone(initialData), b = structuredClone(initialData);
  a.trip.id = 'plan-a'; b.trip.id = 'plan-b';
  return saveLibrary({ revision: 0, currentId: a.trip.id, plans: [a, b] });
}
function request(endpoint: string, body: unknown, origin?: string) {
  return new Request(`http://127.0.0.1:3000/api/ai/${endpoint}`, { method: 'POST', headers: { host: '127.0.0.1:3000', 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
}
test('prompt persists independently from connection settings and retains output constraints', async () => {
  const config = { protocol: 'openai', baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture-key', model: 'fixture-model' };
  writeConfigFile('ai-config.json', config, []);
  assert.equal(readTravelPrompt(), DEFAULT_TRAVEL_PROMPT);
  const custom = '少折返；用简短中文说明取舍。';
  assert.equal(saveTravelPrompt(custom).prompt, custom);
  assert.equal(readTravelPrompt(), custom);
  assert.deepEqual(readConfigFile('ai-config.json', []), config);
  const messages = optimizationMessages([], {}, custom, []);
  assert.ok(messages[0].content.startsWith(OPTIMIZATION_RULES));
  assert.equal(JSON.parse(messages[1].content).travelPreferences, custom);
  assert.equal((await savePromptAPI(request('prompt', { prompt: 'a'.repeat(4001) }))).status, 400);
  assert.equal((await savePromptAPI(request('prompt', { prompt: custom }, 'https://foreign.invalid'))).status, 400);
  assert.equal(saveTravelPrompt(DEFAULT_TRAVEL_PROMPT).prompt, DEFAULT_TRAVEL_PROMPT);
  assert.equal(saveTravelPrompt('').prompt, '', 'empty preferences are supported without removing system constraints');
});
test('reference CRUD is plan-scoped and excludes bodies from lists and plan JSON', () => {
  library();
  const a = addReference('plan-a', '攻略.txt', '国清寺建议上午游览。\r\n\r\n附近可以步行。');
  assert.equal(listReferences('plan-a').length, 1);
  assert.equal(listReferences('plan-b').length, 0);
  assert.ok(!('text' in listReferences('plan-a')[0]));
  assert.throws(() => getReference('plan-b', a.id), /不属于/);
  assert.throws(() => selectedReferences('plan-b', [a.id]), /不属于/);
  assert.throws(() => deleteReference('plan-b', a.id), /不属于/);
  assert.throws(() => selectedReferences('plan-a', [a.id, a.id]), /选择无效/);
  assert.equal(selectedReferences('plan-a', [a.id])[0].text.includes('\r'), false);
  assert.equal(JSON.stringify(loadLibrary()).includes('国清寺建议上午游览'), false);
  deleteReference('plan-a', a.id);
  assert.deepEqual(listReferences('plan-a'), []);
});
test('deleting plans removes only their references after the revision check succeeds', () => {
  const current = library();
  addReference('plan-a', 'a.txt', '甲计划资料'); addReference('plan-b', 'b.txt', '乙计划资料');
  const next = { revision: current.revision, currentId: 'plan-b', plans: current.plans.filter(p => p.trip.id === 'plan-b') };
  assert.throws(() => saveLibrary({ ...next, revision: 0 }));
  assert.equal(listReferences('plan-a').length, 1);
  saveLibrary(next);
  assert.equal(listReferences('plan-b').length, 1);
  const latest = loadLibrary();
  saveLibrary({ ...latest, plans: current.plans });
  assert.deepEqual(listReferences('plan-a'), [], 'reusing a deleted plan ID cannot resurrect its references');
});
test('TXT validation, limits and local request boundaries reject invalid uploads', async () => {
  library();
  assert.throws(() => addReference('missing', 'a.txt', '正文'), /计划不存在/);
  assert.throws(() => addReference('plan-a', 'a.txt', '\0binary'), /TXT/);
  assert.throws(() => addReference('plan-a', 'a.txt', ' '), /TXT/);
  assert.throws(() => addReference('plan-a', 'a.txt', '文'.repeat(35_000)), /100 KB/);
  for (let i = 0; i < 20; i++) addReference('plan-a', `${i}.txt`, '攻略');
  assert.throws(() => addReference('plan-a', '21.txt', '攻略'), /20 份/);
  assert.equal((await upload(request('references', { planId: 'plan-b', name: 'b.txt', text: '资料' }, 'https://foreign.invalid'))).status, 400);
  const response = await list(new Request('http://127.0.0.1:3000/api/ai/references?planId=plan-b', { headers: { host: '127.0.0.1:3000' } }));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { references: [] });
  const utf8 = new TextEncoder().encode('\ufeff旅行攻略');
  assert.equal(decodeReferenceFile(utf8.buffer), '旅行攻略');
  assert.equal(decodeReferenceFile(new Uint8Array([0xb9, 0xa5, 0xc2, 0xd4]).buffer), '攻略');
});
test('retrieval finds relevant late paragraphs, preserves sources and bounds total context', () => {
  const docs: TravelReference[] = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `${i}.txt`, chars: 0, createdAt: 0, text: `${'无关背景。'.repeat(800)}\n\n国清寺游览建议：上午抵达，减少折返。${'相关景点。'.repeat(180)}` }));
  const excerpts = referenceExcerpts(docs, ['国清寺']);
  assert.equal(new Set(excerpts.map(e => e.sourceId)).size, 8);
  assert.ok(excerpts.slice(0, 8).every(e => e.text.includes('国清寺')));
  assert.ok(excerpts.reduce((n, e) => n + e.text.length, 0) <= MAX_REFERENCE_CONTEXT);
  assert.deepEqual(referenceExcerpts([], ['国清寺']), []);
  assert.deepEqual(referenceExcerpts([{ ...docs[0], text: '北京颐和园攻略' }], ['上海外滩']), [], 'unrelated text must not be sent as a fallback');
});
test('optimization sends the saved custom prompt and only selected references to the mocked service', async () => {
  const current = library(), route = current.plans[0].trip.days[0].routes[0];
  const selected = addReference('plan-a', 'chosen.txt', `${route.stops[0].name}：建议从这里开始。`);
  addReference('plan-a', 'private.txt', 'UNSELECTED_REFERENCE_SECRET');
  addReference('plan-b', 'other.txt', 'OTHER_PLAN_REFERENCE_SECRET');
  saveTravelPrompt('请简短说明排序理由');
  writeConfigFile('ai-config.json', { protocol: 'openai', baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture-only', model: 'fixture-model' }, []);
  const oldFetch = globalThis.fetch; let payload: any; let calls = 0;
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), 'https://fixture.invalid/v1/chat/completions'); calls++;
    payload = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ routes: [{ id: route.id, stopIds: route.stops.map(s => s.id) }], explanation: '参考 chosen.txt 安排顺序' }) } }] });
  }) as typeof fetch;
  try {
    const response = await optimize(request('optimize', { planId: 'plan-a', referenceIds: [selected.id], routes: [route], options: { scope: 'route', objective: 'custom', fixedStart: true, fixedEnd: true, startStopId: route.stops[0].id, endStopId: route.stops.at(-1)!.id, lockedIds: [], allowRouteReorder: false, customInstructions: '  先游览景点，再安排附近美食。  ' } }));
    assert.equal(response.status, 200); assert.equal(calls, 1);
    const sent = JSON.parse(payload.messages[1].content);
    assert.equal(sent.travelPreferences, '请简短说明排序理由');
    assert.equal(sent.options.customInstructions, '先游览景点，再安排附近美食。');
    assert.equal(readTravelPrompt(), '请简短说明排序理由', 'request preferences do not overwrite the saved prompt');
    assert.ok(sent.referenceExcerpts.every((r: { sourceId: string }) => r.sourceId === selected.id));
    assert.ok(!JSON.stringify(payload).includes('REFERENCE_SECRET'));
    assert.ok(!JSON.stringify(payload).includes('fixture-only'));
    assert.equal((await response.json()).referenceExcerpts[0].sourceId, selected.id);
  } finally { globalThis.fetch = oldFetch; }
});
test('optimization rejects malformed or oversized request preferences before calling AI', async () => {
  const route = library().plans[0].trip.days[0].routes[0];
  for (const customInstructions of [null, 123, {}, 'a'.repeat(1001), 'bad\0text']) {
    const response = await optimize(request('optimize', { routes: [route], options: { scope: 'route', objective: 'distance', fixedStart: true, fixedEnd: true, lockedIds: [], allowRouteReorder: false, customInstructions } }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /自定义语句格式无效/);
  }
});
test('plain text references use the same plan-scoped storage as uploaded TXT', async () => {
  library();
  const response = await upload(request('references', { planId: 'plan-a', name: '手写游览笔记', text: '国清寺\n附近安排午餐。' }));
  assert.equal(response.status, 200);
  const saved = listReferences('plan-a');
  assert.equal(saved[0].name, '手写游览笔记');
  assert.equal(getReference('plan-a', saved[0].id).text, '国清寺\n附近安排午餐。');
  assert.deepEqual(listReferences('plan-b'), []);
});
test('route palette avoids warm road colors and inactive routes retain a visible casing', () => {
  assert.ok(!COLORS.includes('#ff8b36'));
  const colors = Array.from({ length: 100 }, (_, i) => importedDayColor(i));
  assert.equal(new Set(colors).size, 100);
  for (const color of colors) {
    const [r, g, b] = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const h = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
    assert.ok(h < 20 || h > 85, `avoid yellow/orange ${color}`);
  }
  assert.ok(routeLineStyle().opacity >= .9);
  assert.equal(routeLineStyle().casingWidth - routeLineStyle().width, 4);
  assert.ok(routeLineStyle(true).width > routeLineStyle().width);
});
