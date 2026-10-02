// Isolated UI fixture: copies source without env files; uses only demo data and a loopback AI stub.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const project = path.join(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-map-itinerary-'));
for (const entry of ['src', 'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs']) fs.cpSync(path.join(project, entry), path.join(root, entry), { recursive: true });
fs.symlinkSync(path.join(project, 'node_modules'), path.join(root, 'node_modules'), 'junction');
const dataDir = path.join(root, 'fixture-data'); fs.mkdirSync(dataDir);
require('tsx/cjs');
const { initialData } = require('../src/lib/data.ts');
const data = structuredClone(initialData);
data.trip.name = '城市漫游 · 时间轴验证'; data.trip.days = data.trip.days.slice(0, 1); data.favorites = [];
const day = data.trip.days[0]; day.name = 'Day 1｜14:00–19:00（日期待定；确认预约）'; day.date = '';
day.routes = day.routes.slice(0, 2);
day.routes.forEach((route, index) => {
  route.stops = route.stops.slice(0, 2);
  route.name = index === 0 ? '14:00–15:45｜抵达与入住｜预留出站、打车和入住时间；确认晚餐预约' : '16:00–18:00｜老城漫步｜下午游览，结束后就近晚餐';
  route.mode = index ? 'walking' : 'driving';
  route.stops[0].startTime = index ? '16:00' : '14:00'; route.stops[0].endTime = index ? '16:40' : '14:30';
});
day.transfers = [{ fromRouteId: day.routes[0].id, toRouteId: day.routes[1].id, enabled: true, mode: 'driving', startTime: '15:45', endTime: '16:00', notes: '预留候车时间，抵达后开始步行。' }];
const Database = require('better-sqlite3'); const db = new Database(path.join(dataDir, 'data.sqlite'));
db.exec('CREATE TABLE library (id INTEGER PRIMARY KEY, revision INTEGER, value TEXT)');
db.prepare('INSERT INTO library VALUES(1,1,?)').run(JSON.stringify({ currentId: data.trip.id, plans: [data] })); db.close();
const gateway = http.createServer((req, res) => {
  let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
    const input = JSON.parse(JSON.parse(body).messages[1].content).input;
    const result = typeof input === 'object' ? input : structuredClone(data);
    result.trip.days[0].routes[0].name = '抵达与入住';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }));
  });
});
gateway.listen(32149, '127.0.0.1', () => {
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '32148'], { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', TRIP_MAP_DATA_DIR: dataDir, TRIP_MAP_LEGACY_DIR: root, NEXT_PUBLIC_MAP_PROVIDER: 'mock', NEXT_PUBLIC_AMAP_JS_KEY: '', AMAP_WEB_KEY: '', AMAP_SECURITY_CODE: '', AI_BASE_URL: 'http://127.0.0.1:32149/v1', AI_API_KEY: 'fixture-only', AI_MODEL: 'fixture' } });
  fs.mkdirSync(path.join(project, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(project, 'artifacts/itinerary-fixture.json'), JSON.stringify({ root, pid: process.pid, child: child.pid }));
  console.log('Isolated fixture: http://127.0.0.1:32148');
  child.on('exit', code => { gateway.close(); process.exit(code || 0); });
  process.on('SIGINT', () => { child.kill(); gateway.close(); });
});
