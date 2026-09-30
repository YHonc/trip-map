const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = mkdtempSync(path.join(tmpdir(), 'trip-map-tests-'));
const tests = require('node:fs').readdirSync(path.join(__dirname, '../tests')).filter(file => file.endsWith('.test.ts')).map(file => `tests/${file}`);
const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), '--test', ...tests], { cwd: path.join(__dirname, '..'), env: { ...process.env, TRIP_MAP_DATA_DIR: root, TRIP_MAP_LEGACY_DIR: root, AMAP_WEB_KEY: '', AMAP_SECURITY_CODE: '', NEXT_PUBLIC_AMAP_JS_KEY: '', NEXT_PUBLIC_MAP_PROVIDER: 'mock', AI_API_KEY: '' }, stdio: 'inherit' });
process.exit(result.status || 0);
