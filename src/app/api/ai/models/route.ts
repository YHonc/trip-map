import { aiClient, localRequest, withAIBudget } from '@/services/server/ai';
export async function POST(request: Request) {
  try {
    localRequest(request);
    return await withAIBudget(async () => {
      const { client } = await aiClient();
      const page = await client.models.list();
      return Response.json({ models: page.data.slice(0, 200).map(m => m.id) });
    });
  } catch { return Response.json({ error: '无法读取模型列表，可手动填写模型名称' }, { status: 400 }); }
}
