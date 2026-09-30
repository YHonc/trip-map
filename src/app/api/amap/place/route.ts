import { detailAmap } from '@/services/server/amap';
import { withRequestTrace } from '@/services/server/request-trace';
import { localRequest } from '@/services/server/local-http';
import { checkMapRevision } from '@/services/server/map-config';
export const GET = withRequestTrace(async (request: Request) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  if ([...url.searchParams.keys()].some(key => key !== 'id') || !/^[a-z\d]{1,64}$/i.test(id))
    return Response.json({ error: '地点编号参数无效' }, { status: 400 });
  try {
    localRequest(request); checkMapRevision(request);
    return Response.json({ place: await detailAmap(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '地点读取失败' }, { status: 503 }); }
});
