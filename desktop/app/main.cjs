const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const { mkdirSync, createWriteStream, existsSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const log = require('electron-log/main');

const dataDir = process.env.TRIP_MAP_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'TripMap');
mkdirSync(path.join(dataDir, 'browser'), { recursive: true });
mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
log.transports.file.resolvePathFn = () => path.join(dataDir, 'logs', 'desktop.log');
log.transports.file.maxSize = 5 * 1024 * 1024;
app.setPath('userData', path.join(dataDir, 'browser'));
app.setPath('sessionData', path.join(dataDir, 'browser'));
const singleInstance = app.requestSingleInstanceLock();
let window, server, serverLog, exiting = false, allowClose = false;
const port = Number(process.env.TRIP_MAP_PORT || 32145);
const origin = `http://127.0.0.1:${port}`;
const instance = crypto.randomUUID();
const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '../../.desktop-stage');
const serviceDir = path.join(root, 'server');
function checkPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`端口 ${port} 已被占用。请关闭已启动的网页服务后重试，或设置 TRIP_MAP_PORT。`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
async function waitReady() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (!server || server.exitCode !== null) throw new Error('本机服务启动失败，请查看用户数据目录中的 logs/server.log');
    try { const result = await (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) })).json(); if (result.instance === instance) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('本机服务启动超时，请检查日志后重试');
}
async function launch() {
  log.info('Opening TripMap desktop');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('TRIP_MAP_PORT 应为 1024–65535');
  await checkPort();
  window = new BrowserWindow({ width: 1440, height: 980, minWidth: 1024, minHeight: 720, title: '多日行程地图', backgroundColor: '#dceaff', show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'persist:trip-map' } });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-prevent-unload', event => { if (allowClose) event.preventDefault(); });
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.once('ready-to-show', () => window.show());
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh"><meta charset="utf-8"><body style="font:16px Segoe UI,Microsoft YaHei;background:#dceaff;color:#172a4b;display:grid;place-content:center;height:90vh;text-align:center"><h1>多日行程地图</h1><p>正在打开本机服务…</p></body></html>'));
  serverLog = createWriteStream(path.join(dataDir, 'logs', 'server.log'), { flags: 'a' });
  const node = path.join(root, 'runtime', 'node.exe');
  if (!existsSync(node)) throw new Error('内置 Node 运行时缺失，请重新安装');
  server = spawn(node, [path.join(serviceDir, 'server-launcher.cjs')], { cwd: serviceDir, windowsHide: true, env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), TRIP_MAP_DATA_DIR: dataDir, TRIP_MAP_INSTANCE: instance, TRIP_MAP_PARENT_PID: String(process.pid) }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);
  server.once('error', error => { if (!exiting) { dialog.showErrorBox('本机服务错误', error.message); app.quit(); } });
  server.once('exit', () => { if (!exiting && !allowClose) { dialog.showErrorBox('本机服务已停止', '请重新启动软件。已保存的行程仍在用户数据目录中。'); app.quit(); } });
  await waitReady();
  await window.loadURL(origin);
  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    void window.webContents.executeJavaScript('window.tripMapFlush ? window.tripMapFlush() : true').then(async saved => {
      if (!saved) {
        const answer = await dialog.showMessageBox(window, { type: 'warning', buttons: ['返回导出备份', '放弃未保存编辑并退出'], defaultId: 0, cancelId: 0, message: '当前编辑尚未保存', detail: '建议返回应用导出 JSON，再退出。' });
        if (answer.response !== 1) return;
      }
      allowClose = true; app.quit();
    }).catch(() => { allowClose = true; app.quit(); });
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [
      { label: '在浏览器中打开', click: () => shell.openExternal(origin) },
      { label: '打开用户数据目录', click: () => shell.openPath(dataDir) },
      { type: 'separator' }, { label: '退出', click: () => window.close() },
    ] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
}
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(launch).catch(error => { exiting = true; log.error(error.message); dialog.showErrorBox('无法启动多日行程地图', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { exiting = true; server?.kill(); serverLog?.end(); });
}
