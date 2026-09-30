import { reverseAmap } from '@/services/server/amap';
import { withRequestTrace } from '@/services/server/request-trace';
import { localRequest } from '@/services/server/local-http';
import { checkMapRevision } from '@/services/server/map-config';
export const GET = withRequestTrace(async (request: Request) => {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => key !== 'lng' && key !== 'lat') || !url.searchParams.get('lng')?.trim() || !url.searchParams.get('lat')?.trim())
    return Response.json({ error: '地图坐标参数无效' }, { status: 400 });
  try {
    localRequest(request); checkMapRevision(request);
    return Response.json({ address: await reverseAmap({ lng: Number(url.searchParams.get('lng')), lat: Number(url.searchParams.get('lat')) }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '地址查询失败' }, { status: 503 }); }
});
