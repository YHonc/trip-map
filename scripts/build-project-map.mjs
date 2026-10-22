/** Build a public, read-only Understand-Anything viewer from the reviewed graph. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeViewerNotices } from './project-map-licenses.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamCommit = 'b8c807c632743ab695ec43cb654a0f1efe216bc8';
const upstream = path.join(root, '.tools/understand-anything');
const plugin = path.join(upstream, 'understand-anything-plugin');
const dashboard = path.join(plugin, 'packages/dashboard');
const output = path.join(root, 'docs/project-map');
const graph = JSON.parse(fs.readFileSync(path.join(root, '.ua/knowledge-graph.json'), 'utf8'));
const sourceCommit = graph.project.gitCommitHash;
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A committed source baseline is required.');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use Node.js >= 22.');

function run(command, args, cwd = root) {
  const r = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (r.error || r.status !== 0) throw r.error || new Error(`${command} failed (${r.status})`);
}
function pnpm(args, cwd) {
  // Only fixed, local build arguments; no user text or credentials enter this shell command.
  if (process.platform === 'win32') run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], cwd);
  else run('pnpm', args, cwd);
}
if (!fs.existsSync(path.join(upstream, '.git'))) {
  fs.mkdirSync(path.dirname(upstream), { recursive: true });
  run('git', ['clone', 'https://github.com/Egonex-AI/Understand-Anything.git', upstream]);
  run('git', ['checkout', '--detach', upstreamCommit], upstream);
}
const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim();
if (actual !== upstreamCommit) throw new Error(`Viewer source must be pinned to ${upstreamCommit}; found ${actual}.`);
if (!fs.existsSync(path.join(plugin, 'node_modules'))) pnpm(['install', '--frozen-lockfile'], plugin);
pnpm(['--filter', '@understand-anything/core', 'build'], plugin);

// Public static mode uses committed source snapshots instead of the local token-protected API.
const viewerFile = path.join(dashboard, 'src/components/CodeViewer.tsx');
let viewer = fs.readFileSync(viewerFile, 'utf8');
if (!viewer.includes('sources/${filePath.split("/").map(encodeURIComponent).join("/")}.json')) {
  const old = '  const params = new URLSearchParams({ token, path: filePath });';
  if (!viewer.includes(old)) throw new Error('CodeViewer URL patch no longer matches upstream.');
  viewer = viewer.replace(old, '  if (token === "__demo__") return `./sources/${filePath.split("/").map(encodeURIComponent).join("/")}.json`;\n' + old);
  const start = viewer.indexOf('    if (accessToken === "__demo__") {');
  const end = viewer.indexOf('    const controller = new AbortController();', start);
  if (start < 0 || end < 0) throw new Error('CodeViewer static-mode guard no longer matches upstream.');
  viewer = viewer.slice(0, start) + viewer.slice(end);
  fs.writeFileSync(viewerFile, viewer);
}

pnpm(['exec', 'vite', 'build', '--config', 'vite.config.demo.ts', '--base', './', '--outDir', 'dist-project-map'], dashboard);
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(dashboard, 'dist-project-map'), output, { recursive: true });
const builtAssets = new Set(fs.readdirSync(path.join(dashboard, 'dist-project-map/assets')));
for (const asset of fs.readdirSync(path.join(output, 'assets'))) {
  const candidate = path.join(output, 'assets', asset);
  if (!builtAssets.has(asset) && fs.statSync(candidate).isFile()) fs.unlinkSync(candidate);
}
let html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
html = html.replace(/\r\n?/g, '\n').replace('<html lang="en">', '<html lang="zh-CN">');
html = html.replace(/<title>[^<]*<\/title>/, '<title>TripMap · 中文项目地图</title>');
fs.writeFileSync(path.join(output, 'index.html'), html);
const favicon = path.join(output, 'favicon.svg');
fs.writeFileSync(favicon, fs.readFileSync(favicon, 'utf8').replace(/\r\n?/g, '\n'));
fs.copyFileSync(path.join(root, '.ua/knowledge-graph.json'), path.join(output, 'knowledge-graph.json'));
fs.copyFileSync(path.join(upstream, 'LICENSE'), path.join(output, 'UNDERSTAND-ANYTHING-LICENSE.txt'));
fs.writeFileSync(path.join(output, 'TRIPMAP-LICENSE.txt'), execFileSync('git', ['show', `${sourceCommit}:LICENSE`], { cwd: root }));
writeViewerNotices(plugin, output);
fs.writeFileSync(path.join(output, 'config.json'), JSON.stringify({ outputLanguage: 'zh' }));
fs.writeFileSync(path.join(output, 'meta.json'), JSON.stringify({ gitCommitHash: sourceCommit, lastAnalyzedAt: graph.project.analyzedAt }));
fs.writeFileSync(path.join(output, 'domain-graph.json'), 'null');
fs.writeFileSync(path.join(output, 'diff-overlay.json'), 'null');
fs.mkdirSync(path.join(output, 'sources'), { recursive: true });
const sourceFiles = [...new Set(graph.nodes.map(n => n.filePath).filter(Boolean))];
for (const file of sourceFiles) {
  if (file.startsWith('/') || file.split('/').includes('..') || /[\\\x00-\x1f]/.test(file)) throw new Error('Unsafe source path');
  // Read only content already committed to the public source baseline, never working-tree files.
  const content = execFileSync('git', ['show', `${sourceCommit}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const language = ({ ts: 'typescript', tsx: 'tsx', js: 'javascript', cjs: 'javascript', mjs: 'javascript', md: 'markdown', json: 'json', css: 'css', ps1: 'powershell' })[file.split('.').pop()] || 'text';
  const record = { path: file, language, content, sizeBytes: Buffer.byteLength(content), lineCount: content.split('\n').length };
  // A request URL decodes %2F before filesystem lookup. Keep the source's directory hierarchy.
  const destination = path.join(output, 'sources', file + '.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(record));
}
const provenance = {
  sourceRepository: 'https://github.com/YHonc/trip-map', sourceCommit,
  viewerRepository: 'https://github.com/Egonex-AI/Understand-Anything', viewerCommit: upstreamCommit,
  viewerVersion: '2.9.7', generatedAt: new Date().toISOString(), files: sourceFiles.length,
  nodes: graph.nodes.length, edges: graph.edges.length, layers: graph.layers.length, tourSteps: graph.tour.length,
  adaptations: ['relative static asset URLs', 'Chinese project title', 'committed static source previews'],
};
fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2));
console.log(JSON.stringify(provenance, null, 2));
