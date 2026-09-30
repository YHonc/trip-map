import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMapPicking, type MapPick } from '../src/services/map-picking';
import type { AMapEvent } from '../src/services/amap-sdk';
import { detailAmap } from '../src/services/server/amap';
import { GET } from '../src/app/api/amap/place/route';

function mapFixture() {
  const events = new Map<string, Set<(event: AMapEvent) => void>>();
  const picked: MapPick[] = [];
  const map = {
    on: (name: string, handler: (event: AMapEvent) => void) => { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(handler); },
    off: (name: string, handler: (event: AMapEvent) => void) => { events.get(name)?.delete(handler); },
  };
  const binding = bindMapPicking(map, pick => picked.push(pick));
  return { picked, binding, emit: (name: string, event: AMapEvent = {}) => events.get(name)?.forEach(handler => handler(event)), handlers: () => [...events.values()].reduce((n, set) => n + set.size, 0) };
}
test('single clicks on blank map do not select coordinates; hotspot companion clicks select the POI once', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = mapFixture();
  f.emit('click', { lnglat: { lng: 118.1, lat: 24.5 } });
  t.mock.timers.tick(400); assert.deepEqual(f.picked, []);
  f.emit('hotspotclick', { id: 'B001' });
  f.emit('click', { lnglat: { lng: 118.11, lat: 24.51 } });
  t.mock.timers.tick(400); assert.deepEqual(f.picked, [{ type: 'poi', id: 'B001' }]);
  f.binding.dispose(); assert.equal(f.handlers(), 0);
});
test('hover-only hotspot SDK builds select the known POI; leaving it restores blank-map behavior', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = mapFixture();
  f.emit('hotspotover', { id: 'B002' }); f.emit('click'); f.emit('hotspotclick', { id: 'B002' });
  t.mock.timers.tick(400); assert.deepEqual(f.picked, [{ type: 'poi', id: 'B002' }]);
  f.emit('hotspotout'); f.emit('click'); t.mock.timers.tick(400); assert.equal(f.picked.length, 1);
  f.binding.dispose();
});
test('double click supersedes a pending landmark and ignores its trailing hotspot event', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = mapFixture();
  const coordinate = { lng: 118.123456, lat: 24.505246 };
  f.emit('hotspotover', { id: 'B001' }); f.emit('click');
  t.mock.timers.tick(100); f.emit('dblclick', { lnglat: coordinate }); f.emit('hotspotclick', { id: 'B001' }); f.emit('click');
  t.mock.timers.tick(500); assert.deepEqual(f.picked, [{ type: 'point', coordinate }]);
  f.emit('hotspotclick', { id: 'B002' }); t.mock.timers.tick(400); assert.equal(f.picked[1].type, 'poi');
  f.binding.dispose();
});
test('dragging, zooming, dismissing and unmounting cancel pending selections', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = mapFixture();
  for (const event of ['dragstart', 'zoomstart']) { f.emit('hotspotclick', { id: 'B001' }); f.emit(event); t.mock.timers.tick(400); }
  f.emit('hotspotclick', { id: 'B001' }); f.binding.cancel(); t.mock.timers.tick(400);
  f.emit('dblclick', { lnglat: { lng: NaN, lat: 20 } });
  f.emit('hotspotclick', { id: '../invalid' }); t.mock.timers.tick(400);
  f.emit('hotspotclick', { id: 'B001' }); f.binding.dispose(false); t.mock.timers.tick(400);
  assert.deepEqual(f.picked, []);
});
test('landmark detail endpoint rejects invalid IDs and extra forwarding parameters before any request', async () => {
  assert.throws(() => detailAmap('../invalid'), /编号无效/);
  for (const query of ['', 'id=', 'id=../invalid', 'id=B001&url=https://example.invalid']) {
    const response = await GET(new Request(`http://127.0.0.1:3000/api/amap/place?${query}`));
    assert.equal(response.status, 400);
  }
});
test('landmark lookup uses its canonical ID, name and coordinates and rejects unrelated results', async () => {
  const original = process.env.AMAP_WEB_KEY;
  process.env.AMAP_WEB_KEY = 'fixture-key';
  let calls = 0;
  const fetcher: typeof fetch = async input => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v3/place/detail');
    assert.equal(url.searchParams.get('id'), 'BDETAIL');
    return Response.json({ status: '1', pois: [{ id: 'BDETAIL', name: '测试地标', location: '118.123456,24.505246', address: '正式地址', type: '宾馆酒店' }] });
  };
  try {
    const place = await detailAmap('BDETAIL', fetcher);
    assert.deepEqual({ id: place.id, name: place.name, lng: place.lng, lat: place.lat, source: place.locationSource }, { id: 'amap:BDETAIL', name: '测试地标', lng: 118.123456, lat: 24.505246, source: undefined });
    await detailAmap('BDETAIL', fetcher); assert.equal(calls, 1);
    await assert.rejects(detailAmap('BMISSING', async () => Response.json({ status: '1', pois: [{ id: 'BOTHER', name: '别的地点', location: '118.1,24.5' }] })), /暂未找到/);
  } finally { if (original === undefined) delete process.env.AMAP_WEB_KEY; else process.env.AMAP_WEB_KEY = original; }
});
