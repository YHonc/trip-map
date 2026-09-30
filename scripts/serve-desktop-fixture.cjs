// Standalone integration fixture: no credentials, real user directory, or public network.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-map-standalone-fixture-'));
const resources = path.join(root, 'resources');
fs.cpSync(path.join(__dirname, '../.desktop-stage'), resources, { recursive: true });
let calls = 0;
const gateway = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/stats') { response.end(JSON.stringify({ calls })); return; }
  calls++;
  if (request.url.startsWith('/v3/config/district')) response.end(JSON.stringify({ status: '1', districts: [{ name: '测试城市', adcode: '110000', center: '116.40,39.90', level: 'province' }] }));
  else if (request.url.startsWith('/v3/place/text')) response.end(JSON.stringify({ status: '1', pois: [{ id: 'fixture-poi', name: '测试地点', address: '隔离测试数据', location: '116.40,39.90', type: '测试' }] }));
  else response.end(JSON.stringify({ status: '1', route: { paths: [{ distance: '1200', duration: '600', steps: [{ polyline: '116.400000,39.900000;116.410000,39.910000' }] }] } }));
});
gateway.listen(32147, '127.0.0.1', () => {
  const child = spawn(path.join(resources, 'runtime/node.exe'), [path.join(resources, 'server/server.js')], { cwd: path.join(resources, 'server'), windowsHide: true, stdio: 'inherit', env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: '32146', NODE_ENV: 'production', TRIP_MAP_DATA_DIR: path.join(root, 'data'), TRIP_MAP_LEGACY_DIR: root, NEXT_PUBLIC_MAP_PROVIDER: 'mock', NEXT_PUBLIC_AMAP_JS_KEY: '', AMAP_WEB_KEY: '', AMAP_SECURITY_CODE: '', AI_API_KEY: '' } });
  fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../artifacts/desktop-fixture.json'), JSON.stringify({ root, resources, serverPid: child.pid }));
  console.log('Fixture URL: http://127.0.0.1:32146; gateway: http://127.0.0.1:32147');
  child.on('exit', code => { gateway.close(); process.exit(code || 0); });
  process.on('SIGINT', () => { child.kill(); gateway.close(); });
  process.on('SIGTERM', () => { child.kill(); gateway.close(); });
});
