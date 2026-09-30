import { cacheStats, clearMapCache } from '@/services/server/map-cache';
import { localRequest, jsonBody, noStore } from '@/services/server/local-http';
import type { CacheKind } from '@/lib/map-config';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { localRequest(request); return Response.json(cacheStats(), { headers: noStore }); }
  catch { return Response.json({ error: '缓存状态读取失败' }, { status: 503, headers: noStore }); }
}
export async function POST(request: Request) {
  try {
    localRequest(request); const value = await jsonBody(request);
    if (value.kind !== undefined && !['city', 'search', 'driving', 'walking', 'riding'].includes(String(value.kind))) throw new Error('缓存类别无效');
    clearMapCache(value.kind as CacheKind | undefined);
    return Response.json(cacheStats(), { headers: noStore });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : '缓存清理失败' }, { status: 400, headers: noStore }); }
}
