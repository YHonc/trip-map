import { publicMapConfig, saveMapConfig } from '@/services/server/map-config';
import { dataDirectory } from '@/services/server/data-dir';
import { localRequest, jsonBody, noStore } from '@/services/server/local-http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { localRequest(request); return Response.json({ ...publicMapConfig(), dataDirectory: dataDirectory() }, { headers: noStore }); }
  catch { return Response.json({ error: '无法读取地图配置，请检查用户数据目录' }, { status: 503, headers: noStore }); }
}
export async function POST(request: Request) {
  try { localRequest(request); return Response.json({ ...saveMapConfig(await jsonBody(request)), dataDirectory: dataDirectory() }, { headers: noStore }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : '配置保存失败' }, { status: 400, headers: noStore }); }
}
