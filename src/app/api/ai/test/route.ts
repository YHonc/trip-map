import { aiClient, localRequest, withAIBudget } from '@/services/server/ai';
export async function POST(request: Request) {
  try {
    localRequest(request);
    return await withAIBudget(async () => {
      const { client, config } = await aiClient();
      const result = await client.chat.completions.create({ model: config.model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 16 });
      if (!result.choices[0]?.message.content) throw new Error('empty');
      return Response.json({ ok: true });
    });
  } catch { return Response.json({ error: '连接失败或服务正忙，请检查地址、密钥、模型及服务状态' }, { status: 400 }); }
}
