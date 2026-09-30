const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-map-web-package-fixture-'));
const zip = path.resolve(__dirname, '../release/TripMap-Web-1.1.0-x64.zip');
const quote = value => `'${value.replace(/'/g, "''")}'`;
const expanded = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(root)}`], { windowsHide: true, stdio: 'inherit' });
if (expanded.status !== 0) process.exit(expanded.status || 1);
const env = { ...process.env, TRIP_MAP_DATA_DIR: path.join(root, 'user-data'), TRIP_MAP_PORT: '32151', TRIP_MAP_LEGACY_DIR: root, PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0` };
const base = 'http://127.0.0.1:32151';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  const child = spawn(path.join(root, 'runtime/node.exe'), [path.join(root, 'start-web.cjs')], { env, cwd: root, windowsHide: true, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) })).ok) return child; } catch {}
    if (child.exitCode !== null) throw new Error('Web launcher exited early');
    await wait(250);
  }
  child.kill(); throw new Error('Web launcher did not start');
}
async function stop(child) {
  child.kill();
  for (let i = 0; i < 30; i++) {
    try { await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) }); } catch { return; }
    await wait(250);
  }
  throw new Error('Orphaned service after launcher stopped');
}
async function main() {
  let child = await start();
  try {
    const response = await fetch(`${base}/api/plans`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, currentId: 'web-fixture', plans: [{ version: 2, trip: { id: 'web-fixture', name: '网页包保存核验', days: [] }, favorites: [] }] }) });
    assert.equal(response.status, 200);
    await stop(child);
    child = await start();
    assert.equal((await (await fetch(`${base}/api/plans`)).json()).plans[0].trip.name, '网页包保存核验');
    console.log(JSON.stringify({ passed: ['web ZIP extracted outside workspace', 'bundled Node starts local website', 'SQLite data survives service restart', 'launcher death cleans child service'], root }));
  } finally { await stop(child); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
