import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/project-map');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const graph = JSON.parse(read('.ua/knowledge-graph.json'));
assert.equal(read('.ua/knowledge-graph.json'), read('docs/project-map/knowledge-graph.json'), 'Published graph differs');
const provenance = JSON.parse(read('docs/project-map/provenance.json'));
assert.equal(provenance.sourceCommit, graph.project.gitCommitHash);
assert.match(provenance.sourceCommit, /^[a-f0-9]{40}$/);
const ids = new Set(graph.nodes.map(n => n.id));
assert.equal(ids.size, graph.nodes.length, 'Duplicate node IDs');
const sourceFiles = [...new Set(graph.nodes.map(n => n.filePath).filter(Boolean))];
assert.equal(sourceFiles.length, provenance.files);
const sources = new Map();
for (const file of sourceFiles) {
  assert(!/(^|\/)(\.env[^/]*|\.tools|\.agents|node_modules|release|artifacts)(\/|$)/.test(file), `Unexpected source: ${file}`);
  const source = JSON.parse(fs.readFileSync(path.join(out, 'sources', file + '.json'), 'utf8'));
  assert.equal(source.path, file);
  assert.equal(source.sizeBytes, Buffer.byteLength(source.content));
  assert.equal(source.lineCount, source.content.split('\n').length);
  sources.set(file, source);
}
// One Git process verifies all exported previews against the named public commit.
const result = spawnSync('git', ['cat-file', '--batch'], {
  cwd: root, input: sourceFiles.map(p => `${provenance.sourceCommit}:${p}`).join('\n') + '\n', maxBuffer: 16 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr?.toString());
let offset = 0;
for (const file of sourceFiles) {
  const end = result.stdout.indexOf(10, offset);
  const header = result.stdout.subarray(offset, end).toString().split(' ');
  assert.equal(header[1], 'blob', `Missing committed source: ${file}`);
  const size = Number(header[2]);
  assert.equal(result.stdout.subarray(end + 1, end + 1 + size).toString('utf8'), sources.get(file).content, `Source mismatch: ${file}`);
  offset = end + 1 + size + 1;
}
for (const n of graph.nodes) {
  assert(n.name && n.summary && n.tags.length, `Incomplete node: ${n.id}`);
  assert.equal(graph.layers.filter(l => l.nodeIds.includes(n.id)).length, 1, `Layer assignment: ${n.id}`);
  if (n.lineRange) assert(n.lineRange[0] >= 1 && n.lineRange[1] <= sources.get(n.filePath).lineCount && n.lineRange[0] <= n.lineRange[1], `Invalid lines: ${n.id}`);
}
for (const e of graph.edges) assert(ids.has(e.source) && ids.has(e.target), 'Dangling edge');
for (const step of graph.tour) {
  assert(step.title && step.description && step.nodeIds.length);
  step.nodeIds.forEach(id => assert(ids.has(id), 'Dangling tour entry'));
}
const html = read('docs/project-map/index.html');
let assets = 0;
for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^https?:/.test(m[1])) continue;
  assert(!m[1].startsWith('/'), 'Static asset must be relative');
  assert(fs.existsSync(path.join(out, m[1])), `Missing asset: ${m[1]}`);
  assets++;
}
for (const file of ['docs/.nojekyll', 'docs/project-map/UNDERSTAND-ANYTHING-LICENSE.txt', 'docs/project-map/THIRD-PARTY-LICENSES.txt']) assert(fs.existsSync(path.join(root, file)));
let links = 0;
for (const file of ['README.md', 'docs/project-map-guide.md', 'docs/development-guide.md', '.ua/README.md', '文件夹架构说明.md']) {
  const text = read(file);
  assert(!text.includes('\uFFFD'), `Invalid UTF-8 text: ${file}`);
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(m[1])) continue;
    const target = m[1].split('#')[0];
    assert(fs.existsSync(path.resolve(root, path.dirname(file), target)), `Missing document link: ${file} -> ${target}`);
    links++;
  }
}
console.log(JSON.stringify({files:sourceFiles.length,nodes:graph.nodes.length,edges:graph.edges.length,layers:graph.layers.length,tourSteps:graph.tour.length,assets,documentLinks:links,committedSourcePreviews:'verified',issues:[]},null,2));
