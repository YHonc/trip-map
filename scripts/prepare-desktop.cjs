const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stage = path.join(root, '.desktop-stage');
// This exact workspace-owned staging directory never contains user data.
if (path.dirname(stage) !== root || path.basename(stage) !== '.desktop-stage') throw new Error('Invalid stage');
if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
const env = { ...process.env, NEXT_PUBLIC_MAP_PROVIDER: 'mock', NEXT_PUBLIC_AMAP_JS_KEY: '', AMAP_WEB_KEY: '', AMAP_SECURITY_CODE: '', AI_BASE_URL: '', AI_API_KEY: '', AI_MODEL: '', NEXT_TELEMETRY_DISABLED: '1' };
const build = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--webpack'], { cwd: root, env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
fs.mkdirSync(stage, { recursive: true });
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) fs.copyFileSync(path.join(root, name), path.join(stage, name));
fs.cpSync(path.join(root, '.next', 'standalone'), path.join(stage, 'server'), { recursive: true, filter: source => !['.local', 'artifacts', 'release'].includes(path.basename(source)) && !path.basename(source).startsWith('.env') });
fs.cpSync(path.join(root, '.next', 'static'), path.join(stage, 'server', '.next', 'static'), { recursive: true });
if (fs.existsSync(path.join(root, 'public'))) fs.cpSync(path.join(root, 'public'), path.join(stage, 'server', 'public'), { recursive: true });
fs.mkdirSync(path.join(stage, 'runtime'), { recursive: true });
fs.copyFileSync(path.join(root, 'desktop', 'server-launcher.cjs'), path.join(stage, 'server', 'server-launcher.cjs'));
fs.copyFileSync(process.execPath, path.join(stage, 'runtime', 'node.exe'));
const license = spawnSync('curl.exe', ['-f', '-L', '--max-time', '60', '--silent', '--show-error', `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, '-o', path.join(stage, 'runtime', 'NODE-LICENSE.txt')], { stdio: 'inherit' });
if (license.status !== 0) throw new Error('Could not include the bundled Node license');
function copyLicenses(relative = '') {
  const moduleDir = path.join(stage, 'server', 'node_modules', relative);
  if (!fs.existsSync(moduleDir)) return;
  for (const entry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleName = path.join(relative, entry.name);
    if (entry.name.startsWith('@')) { copyLicenses(moduleName); continue; }
    const original = path.join(root, 'node_modules', moduleName);
    if (!fs.existsSync(original)) continue;
    for (const name of fs.readdirSync(original)) if (/^(license|notice|copying)/i.test(name) && fs.statSync(path.join(original, name)).isFile()) fs.copyFileSync(path.join(original, name), path.join(moduleDir, entry.name, name));
  }
}
copyLicenses();
// Verify the native SQLite module matches the exact bundled Node ABI, not Electron's ABI.
const verify = spawnSync(path.join(stage, 'runtime', 'node.exe'), ['-e', "const p=require('path'); const resolved=require.resolve('better-sqlite3'); if(!resolved.startsWith(p.join(process.cwd(),'node_modules')+p.sep)) throw Error('SQLite missing from bundle'); const D=require('better-sqlite3'); const d=new D(':memory:'); d.exec('SELECT 1'); d.close()"], { cwd: path.join(stage, 'server'), stdio: 'inherit' });
if (verify.status !== 0) process.exit(verify.status || 1);
fs.copyFileSync(path.join(root, 'desktop', 'web-start.cjs'), path.join(stage, 'start-web.cjs'));
fs.writeFileSync(path.join(stage, 'Start-Web.cmd'), '@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node.exe" start-web.cjs\r\npause\r\n');
console.log('Desktop and portable web resources prepared in .desktop-stage');
