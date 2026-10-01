import { mapUsageStats } from '@/services/server/map-usage';
import { localRequest, noStore } from '@/services/server/local-http';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { localRequest(request); }
  catch { return Response.json({ error: '仅允许本机访问' }, { status: 403, headers: noStore }); }
  try { return Response.json(mapUsageStats(), { headers: noStore }); }
  catch { return Response.json({ error: 'API 用量读取失败，请稍后刷新' }, { status: 503, headers: noStore }); }
}
