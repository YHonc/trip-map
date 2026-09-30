const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-map-portable-fixture-'));
const { version } = require('../desktop/app/package.json');
const exe = path.resolve(__dirname, `../release/TripMap-Portable-${version}-x64.exe`);
const env = { ...process.env, TRIP_MAP_DATA_DIR: dataDir, TRIP_MAP_LEGACY_DIR: dataDir, TRIP_MAP_PORT: '32149', NEXT_PUBLIC_MAP_PROVIDER: 'mock', NEXT_PUBLIC_AMAP_JS_KEY: '', AMAP_WEB_KEY: '', AMAP_SECURITY_CODE: '', AI_API_KEY: '', PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0` };
async function run() {
  const processHandle = spawn(exe, ['--remote-debugging-port=32150'], { cwd: os.tmpdir(), env, windowsHide: true, stdio: 'ignore' });
  console.log(`Portable wrapper PID ${processHandle.pid}; isolated data ${dataDir}`);
  let browser;
  try {
    let ready = false;
    for (let n = 0; n < 120; n++) {
      try { const response = await fetch('http://127.0.0.1:32149/api/health', { signal: AbortSignal.timeout(500) }); if (response.ok) { ready = true; break; } } catch {}
      if (processHandle.exitCode !== null) throw new Error(`Portable exited early: ${processHandle.exitCode}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Portable service did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:32150');
    const page = browser.contexts()[0].pages().find(p => p.url().includes('32149')) || browser.contexts()[0].pages()[0];
    await page.getByRole('button', { name: '地图设置', exact: true }).waitFor();
    await page.locator('.startup-overlay').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '切换或管理旅行计划', exact: true }).click();
    await page.getByRole('button', { name: /^重命名计划：/ }).click();
    await page.getByRole('textbox', { name: '计划名称', exact: true }).fill('便携版保存核验');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    assert.ok(await page.evaluate(() => window.tripMapFlush()));
    const data = await (await fetch('http://127.0.0.1:32149/api/plans')).json();
    assert.equal(data.plans[0].trip.name, '便携版保存核验');
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/portable-exe-verified.png') });
    const cdp = await browser.newBrowserCDPSession();
    void cdp.send('Browser.close').catch(() => {});
    for (let n = 0; n < 20 && processHandle.exitCode === null; n++) await new Promise(resolve => setTimeout(resolve, 500));
    await assert.rejects(fetch('http://127.0.0.1:32149/api/health', { signal: AbortSignal.timeout(1000) }));
    console.log(JSON.stringify({ passed: ['portable EXE launched from outside workspace without external Node', 'desktop renderer available', 'SQLite write persisted', 'graceful exit released port'], dataDir }));
  } finally { if (browser) await Promise.race([browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]); if (processHandle.exitCode === null) processHandle.kill(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
