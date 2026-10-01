import { staticMapAmap, validateStaticViewport } from '@/services/server/static-map';
import { localRequest } from '@/services/server/local-http';
import { checkMapRevision } from '@/services/server/map-config';
import { withRequestTrace } from '@/services/server/request-trace';

export const GET = withRequestTrace(async (request: Request) => {
  try { localRequest(request); checkMapRevision(request); }
  catch { return Response.json({ error: '请求来源或地图配置已失效，请刷新后重试' }, { status: 403 }); }
  const params = new URL(request.url).searchParams;
  const viewport = { center: { lng: Number(params.get('lng')), lat: Number(params.get('lat')) }, zoom: Number(params.get('zoom')) };
  try {
    if (params.size !== 3 || !['lng', 'lat', 'zoom'].every(key => params.get(key)?.trim())) throw new Error();
    validateStaticViewport(viewport);
  } catch { return Response.json({ error: '导出底图参数无效' }, { status: 400 }); }
  try { return Response.json({ dataUrl: await staticMapAmap(viewport) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : '导出底图失败' }, { status: 503 }); }
});
