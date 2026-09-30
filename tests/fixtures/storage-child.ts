import { loadLibrary } from '../../src/services/server/plan-store';
import { cachedMap } from '../../src/services/server/map-cache';
import { defaultCachePolicy } from '../../src/lib/map-config';
const config = { provider: 'amap' as const, jsKey: 'fixture', webKey: 'fixture', securityCode: 'fixture', baseURL: 'https://example.invalid', revision: 'fixture', cache: defaultCachePolicy };
async function main() {
  if (process.argv[2] === 'plans') console.log(JSON.stringify(loadLibrary()));
  else console.log(JSON.stringify(await cachedMap('city', ['restart'], config, async () => { throw new Error('Unexpected upstream request after restart'); })));
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
