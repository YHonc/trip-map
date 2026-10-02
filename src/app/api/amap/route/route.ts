import { routeAmap } from '@/services/server/amap';
import { withRequestTrace } from '@/services/server/request-trace';
import { localRequest } from '@/services/server/local-http';
import { checkMapRevision } from '@/services/server/map-config';
export const POST = withRequestTrace(async (request: Request) => {
  try {
    const text = await request.text();
    if (text.length > 1000) return Response.json({ error: '请求过大' }, { status: 413 });
    const data = JSON.parse(text);
    if (Object.keys(data).some(key => !['origin', 'destination', 'mode', 'city'].includes(key)))
      return Response.json({ error: '不支持的参数' }, { status: 400 });
    localRequest(request);
    checkMapRevision(request);
    return Response.json(await routeAmap(data.origin, data.destination, data.mode, fetch, data.city), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '路线规划失败' }, { status: 503 });
  }
});
