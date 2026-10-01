import { checkBudget } from '@/services/server/amap';
import { readMapConfig } from '@/services/server/map-config';
import { localRequest } from '@/services/server/local-http';
import { markUpstreamRequest } from '@/services/server/request-trace';

// The SDK needs only initialization and style services. POI calls use our typed API.
const endpoints: Record<string, string> = {
  'v3/log/init': 'https://restapi.amap.com/v3/log/init',
  'v4/map/styles': 'https://webapi.amap.com/v4/map/styles',
};
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try { localRequest(request); } catch { return new Response('Forbidden', { status: 403 }); }
  const config = readMapConfig();
  const { path } = await context.params;
  const target = Object.hasOwn(endpoints, path.join('/')) ? endpoints[path.join('/')] : undefined;
  if (!target) return Response.json({ error: '不支持的高德服务' }, { status: 404 });
  const incoming = new URL(request.url);
  const allowed = new Set(['key', 'v', 'callback', 'type', 'platform', 'logversion', 's', 'styleid', 'style', 'sdkversion', 'eventId', 'product', 't', 'csid', 'appname', 'resolution', 'mob', 'vt', 'dpr', 'scale', 'label', 'value']);
  if (incoming.search.length > 4096 || [...incoming.searchParams.keys()].some(key => !allowed.has(key)))
    return Response.json({ error: '不支持的 SDK 参数' }, { status: 400 });
  if (!config.securityCode || !config.jsKey)
    return Response.json({ error: '未配置高德 JS Key 或安全密钥' }, { status: 503 });
  const callback = incoming.searchParams.get('callback');
  if (callback && !/^[\w.$]{1,120}$/.test(callback)) return new Response('Invalid callback', { status: 400 });
  try {
    checkBudget(120);
    const url = new URL(target);
    url.search = incoming.search;
    url.searchParams.set('key', config.jsKey);
    url.searchParams.set('jscode', config.securityCode);
    markUpstreamRequest(path.join('/') === 'v3/log/init' ? 'sdk-init' : 'sdk-style');
    const result = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' });
    if (!result.ok) return new Response('AMap unavailable', { status: 502 });
    return new Response(await result.text(), { headers: { 'Content-Type': callback ? 'application/javascript' : 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: '高德代理超时或请求过于频繁' }, { status: 503 }); }
}
