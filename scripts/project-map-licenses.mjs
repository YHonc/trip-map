import fs from 'node:fs';
import path from 'node:path';

// Include installed dependency notices conservatively; some are build-only.
export function writeViewerNotices(plugin, output) {
  const store = path.join(plugin, 'node_modules/.pnpm');
  const records = new Map();
  function inspect(directory) {
    const manifest = path.join(directory, 'package.json');
    if (!fs.existsSync(manifest)) return;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (records.has(key)) return;
    const names = fs.readdirSync(directory).filter(n => /^(license|licence|copying|notice)(\.|$|-)/i.test(n));
    const notices = names.filter(n => fs.statSync(path.join(directory, n)).isFile()).map(n => `${n}\n${fs.readFileSync(path.join(directory, n), 'utf8')}`);
    if (notices.length) records.set(key, `${key}\nLicense: ${typeof pkg.license === 'string' ? pkg.license : 'See notices'}\n\n${notices.join('\n\n')}`);
  }
  for (const entry of fs.readdirSync(store)) {
    const modules = path.join(store, entry, 'node_modules');
    if (!fs.existsSync(modules)) continue;
    for (const item of fs.readdirSync(modules)) {
      if (item.startsWith('@')) {
        for (const child of fs.readdirSync(path.join(modules, item))) inspect(path.join(modules, item, child));
      } else inspect(path.join(modules, item));
    }
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'THIRD-PARTY-LICENSES.txt'), 'Understand-Anything static viewer dependency notices\nIncludes runtime and build dependencies from the pinned installation.\n\n' + [...records.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value).join('\n\n' + '='.repeat(72) + '\n\n'));
  return records.size;
}
