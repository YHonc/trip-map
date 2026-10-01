import { jsonBody, localRequest, noStore } from '@/services/server/local-http';
import { promptSettings, saveTravelPrompt } from '@/services/server/ai-prompt';

export async function GET(request: Request) {
  try { localRequest(request); return Response.json(promptSettings(), { headers: noStore }); }
  catch { return Response.json({ error: '无法读取提示词设置' }, { status: 400 }); }
}
export async function POST(request: Request) {
  try { localRequest(request); return Response.json(saveTravelPrompt((await jsonBody(request)).prompt), { headers: noStore }); }
  catch { return Response.json({ error: '提示词保存失败，请使用 4000 字以内的文本' }, { status: 400 }); }
}
