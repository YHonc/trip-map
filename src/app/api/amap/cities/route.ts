import { searchCities } from '@/services/server/cities';
import { withRequestTrace } from '@/services/server/request-trace';
import { localRequest } from '@/services/server/local-http';
import { checkMapRevision } from '@/services/server/map-config';
export const GET = withRequestTrace(async (request: Request) => {
  const url = new URL(request.url);
  try {
    localRequest(request);
    checkMapRevision(request);
    if ([...url.searchParams.keys()].some(k => k !== 'q')) throw new Error('不支持的参数');
    return Response.json({ cities: await searchCities(url.searchParams.get('q') ?? '') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : '城市查询失败' }, { status: 400 }); }
});
