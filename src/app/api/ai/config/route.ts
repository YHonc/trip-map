import { localRequest, publicAIConfig, readBody, saveAIConfig } from '@/services/server/ai';
export async function GET(request: Request) {
  try { localRequest(request); return Response.json(await publicAIConfig(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: '无法读取本机 AI 配置' }, { status: 400 }); }
}
export async function POST(request: Request) {
  try { localRequest(request); return Response.json(await saveAIConfig(await readBody(request))); }
  catch { return Response.json({ error: '保存失败，请检查 API 地址、模型和密钥格式；仅支持本机操作' }, { status: 400 }); }
}
