import { readMapConfig, publicMapConfig } from '@/services/server/map-config';
import { localRequest, noStore } from '@/services/server/local-http';
import { checkBudget, waitForAmapSlot } from '@/services/server/amap';
export async function POST(request: Request) {
  try {
    localRequest(request);
    const config = readMapConfig();
    if (!config.webKey) throw new Error('请先保存 Web 服务 Key');
    checkBudget(); await waitForAmapSlot();
    const url = new URL(`${config.baseURL}/v3/config/district`);
    url.search = new URLSearchParams({ key: config.webKey, keywords: '110000', subdistrict: '0', extensions: 'base' }).toString();
    const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (!response.ok || result.status !== '1') throw new Error(`Web 服务连接失败${/^\d{5}$/.test(String(result.infocode)) ? `（错误码 ${result.infocode}）` : ''}`);
    return Response.json({ message: `Web 服务连接成功。${publicMapConfig().ready ? 'JS Key 与安全密钥需通过实际底图加载验证。' : '底图配置尚未完整。'}` }, { headers: noStore });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : '连接失败' }, { status: 400, headers: noStore }); }
}
