module.exports = {
  electronDist: require('node:fs').existsSync(require('node:path').resolve(__dirname, '../node_modules/electron/dist/electron.exe')) ? require('node:path').resolve(__dirname, '../node_modules/electron/dist') : undefined,
  appId: 'local.tripmap.desktop', productName: 'TripMap', electronVersion: '44.4.5',
  directories: { app: 'desktop/app', output: 'release', buildResources: 'desktop/resources' },
  files: ['main.cjs', 'package.json'],
  afterPack: async context => {
    const path = require('node:path');
    const server = path.join(context.appOutDir, 'resources/server');
    const node = path.join(context.appOutDir, 'resources/runtime/node.exe');
    // electron-builder's resource copier excludes node_modules; standalone owns its complete dependency tree.
    require('node:fs').cpSync(path.resolve(__dirname, '../.desktop-stage/server'), server, { recursive: true });
    const result = require('node:child_process').spawnSync(node, ['-e', "const p=require('path'); for(const name of ['next','better-sqlite3']) { if(!require.resolve(name).startsWith(p.join(process.cwd(),'node_modules')+p.sep)) throw Error(name+' missing from release'); } const D=require('better-sqlite3'); new D(':memory:').close();"], { cwd: server, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw new Error('Release is missing standalone dependencies');
  },
  extraResources: [
    { from: '.desktop-stage/runtime', to: 'runtime', filter: ['**/*'] },
    { from: 'LICENSE', to: 'LICENSE' },
    { from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
  ],
  asar: true, npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }], signAndEditExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, shortcutName: '多日行程地图', artifactName: 'TripMap-Setup-${version}-${arch}.${ext}' },
  portable: { artifactName: 'TripMap-Portable-${version}-${arch}.${ext}' },
  publish: null,
};
