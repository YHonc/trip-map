const { _electron: electron, chromium } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const dataDir = process.env.TRIP_MAP_SMOKE_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'trip-map-electron-fixture-'));
const exe = process.env.TRIP_MAP_SMOKE_EXE;
const port = '32148';
const env = { ...process.env, TRIP_MAP_DATA_DIR: dataDir, TRIP_MAP_LEGACY_DIR: dataDir, TRIP_MAP_PORT: port, NEXT_PUBLIC_MAP_PROVIDER: 'mock', NEXT_PUBLIC_AMAP_JS_KEY: '', AMAP_WEB_KEY: '', AMAP_SECURITY_CODE: '', AI_API_KEY: '' };
// The packaged launch deliberately hides external Node/npm from PATH.
if (exe) env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`;
async function launch() {
  const app = await electron.launch({ ...(exe ? { executablePath: path.resolve(exe) } : {}), args: exe ? [] : [path.resolve(__dirname, '../desktop/app')], env, timeout: 60000 });
  app.on('window', page => page.on('pageerror', error => console.error('Renderer:', error.message)));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '地图设置', exact: true }).waitFor({ timeout: 60000 });
  await page.locator('.startup-overlay').waitFor({ state: 'hidden' });
  return { app, page };
}
async function main() {
  let current;
  try {
    current = await launch();
    await current.page.getByRole('button', { name: '编辑行程名称', exact: true }).click();
    await current.page.getByRole('textbox', { name: '行程名称', exact: true }).fill('Electron 关闭保存核验');
    await current.page.getByRole('button', { name: '保存', exact: true }).click();
    const exited = current.app.waitForEvent('close', { timeout: 30000 });
    await current.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await exited;
    current = await launch();
    await current.page.getByRole('combobox', { name: '切换旅行计划' }).filter({ hasText: 'Electron 关闭保存核验' }).waitFor();
    const response = await fetch(`http://127.0.0.1:${port}/api/plans`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).plans[0].trip.name, 'Electron 关闭保存核验');
    await current.page.getByRole('button', { name: '地图设置', exact: true }).click();
    await current.page.getByRole('button', { name: '缓存与数据', exact: true }).click();
    await current.page.screenshot({ path: path.resolve(__dirname, '../artifacts/electron-desktop-verified.png') });
    await current.page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await current.app.close(); current = undefined;
    await new Promise(resolve => setTimeout(resolve, 500));
    await assert.rejects(fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) }));
    console.log(JSON.stringify({ passed: ['Electron renderer opened', 'close flushed pending edits', 'restart preserved SQLite plans', 'ordinary HTTP browser endpoint available', 'settings rendered', 'quit released the port'], dataDir, exe: exe || 'development-shell' }));
  } finally { if (current) await current.app.close().catch(() => {}); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
