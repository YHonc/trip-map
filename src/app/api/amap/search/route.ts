import { searchAmap } from '@/services/server/amap';
import { withRequestTrace } from '@/services/server/request-trace';
import { localRequest } from '@/services/server/local-http';
import { checkMapRevision } from '@/services/server/map-config';
export const GET = withRequestTrace(async (request: Request) => {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => key !== 'q' && key !== 'city'))
    return Response.json({ error: '不支持的参数' }, { status: 400 });
  try {
    localRequest(request);
    checkMapRevision(request);
    return Response.json({ places: await searchAmap(url.searchParams.get('q') ?? '', fetch, url.searchParams.get('city') ?? undefined) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '搜索失败' }, { status: 503 });
  }
});
