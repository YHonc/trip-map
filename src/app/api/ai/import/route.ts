import { aiClient, withAIBudget } from '@/services/server/ai';
import { localRequest, jsonBody, noStore } from '@/services/server/local-http';
import { prepareAIImport, validateAIImport } from '@/lib/ai-import';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = await jsonBody(request, 100_000);
    const { source, messages } = prepareAIImport(body.text);
    return await withAIBudget(async () => {
      const { client, config } = await aiClient();
      const result = await client.chat.completions.create({ model: config.model, messages, max_tokens: 12000 });
      const choice = result.choices[0];
      if (!choice?.message.content || choice.finish_reason !== 'stop') throw new Error('AI 响应不完整，请缩短原文后重试');
      return Response.json(validateAIImport(choice.message.content.trim(), source), { headers: noStore });
    });
  } catch (error) {
    const detail = error instanceof Error && /^(导入文本|AI 整理|AI 正忙|请先|AI 改变|AI 响应)/.test(error.message) ? error.message : '服务请求或数据结构校验失败，请检查 AI 配置或缩短原文';
    return Response.json({ error: `${detail}。原始输入与当前行程均已保留。` }, { status: 400, headers: noStore });
  }
}
