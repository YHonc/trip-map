import { mapUsageStats } from '../../src/services/server/map-usage';
import { searchAmap } from '../../src/services/server/amap';

async function main() {
  // A restart must use the disk entry; any upstream attempt fails this fixture.
  globalThis.fetch = async () => { throw new Error('Unexpected upstream call'); };
  if (process.argv[2] === 'cache') await searchAmap('厦门缓存测试');
  console.log(JSON.stringify(mapUsageStats()));
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
