/** Disposable UI fixture: no user plan data or live provider credentials. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import next from 'next';
import { saveLibrary } from '../../src/services/server/plan-store';
import { readMapConfig, saveMapConfig } from '../../src/services/server/map-config';
import type { PlannerData } from '../../src/lib/types';

const root = mkdtempSync(path.join(tmpdir(), 'trip-map-ui-fixture-'));
Object.assign(process.env, { TRIP_MAP_DATA_DIR: root, TRIP_MAP_LEGACY_DIR: root, NEXT_PUBLIC_MAP_PROVIDER: 'mock', NEXT_PUBLIC_AMAP_JS_KEY: '', AMAP_WEB_KEY: '', AMAP_SECURITY_CODE: '', AI_API_KEY: '' });
saveMapConfig({ ...readMapConfig(), provider: 'mock', jsKey: '', webKey: '', securityCode: '' });
const plan = (id: string, name: string, lng: number, lat: number, cityName: string, adcode: string): PlannerData => ({ version: 2, trip: { id, name, days: [{ id: `${id}-day`, name: 'Day 1', date: '2026-09-30', color: '#237bff', city: { name: cityName, adcode, lng, lat, provider: 'amap', coordinateSystem: 'GCJ-02' }, routes: [] }] }, favorites: [] });
saveLibrary({ revision: 0, currentId: 'fixture-xiamen', plans: [plan('fixture-xiamen', '测试·厦门', 118.0894, 24.4798, '厦门市', '350200'), plan('fixture-hangzhou', '测试·杭州', 120.1551, 30.2741, '杭州市', '330100')] });
async function main() {
  const app = next({ dev: false, hostname: '127.0.0.1', port: 3101 });
  await app.prepare();
  createServer(app.getRequestHandler()).listen(3101, '127.0.0.1', () => console.log(`Disposable UI fixture: http://127.0.0.1:3101 | PID ${process.pid} | ${root}`));
}
void main();
