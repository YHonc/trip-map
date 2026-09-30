import { loadLibrary, saveLibrary, LibraryConflict } from '@/services/server/plan-store';
import { localRequest, jsonBody, noStore } from '@/services/server/local-http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { localRequest(request); return Response.json(loadLibrary(), { headers: noStore }); }
  catch { return Response.json({ error: '无法读取本机计划库' }, { status: 503, headers: noStore }); }
}
export async function PUT(request: Request) {
  try { localRequest(request); return Response.json(saveLibrary(await jsonBody(request, 8_000_000)), { headers: noStore }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : '保存失败' }, { status: e instanceof LibraryConflict ? 409 : 400, headers: noStore }); }
}
