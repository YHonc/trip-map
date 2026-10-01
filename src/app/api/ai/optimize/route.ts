import { aiClient, localRequest, readBody, withAIBudget } from '@/services/server/ai';
import { validateCandidate, validateOptimizationNote, type OptimizeOptions } from '@/lib/optimization';
import type { Route } from '@/lib/types';
import { optimizationMessages } from '@/lib/ai-prompt';
import { referenceExcerpts } from '@/lib/travel-references';
import { selectedReferences } from '@/services/server/reference-store';
import { readTravelPrompt } from '@/services/server/ai-prompt';
import { hasCoordinates } from '@/lib/location';
export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = await readBody(request);
    const routes = body.routes as Route[];
    const input = body.options as OptimizeOptions;
    const options: OptimizeOptions = input && { scope: input.scope, objective: input.objective, fixedStart: input.fixedStart, fixedEnd: input.fixedEnd, lockedIds: input.lockedIds, allowRouteReorder: input.allowRouteReorder, customInstructions: validateOptimizationNote(input.customInstructions) };
    if (!Array.isArray(routes) || !routes.length || routes.length > 8 || routes.reduce((n, r) => n + (r.stops?.length ?? 1000), 0) > 40 || !options || !['duration', 'distance'].includes(options.objective) || !['route', 'day'].includes(options.scope) || !Array.isArray(options.lockedIds) || ['fixedStart', 'fixedEnd', 'allowRouteReorder'].some(k => typeof options[k as keyof OptimizeOptions] !== 'boolean')) throw new Error('invalid input');
    if (options.scope === 'route' && (routes.length !== 1 || options.allowRouteReorder)) throw new Error('invalid scope');
    // Whitelist fields: never forward favorites, history or the complete saved trip.
    const minimal = routes.map(r => ({ id: r.id, mode: r.mode, stops: r.stops.map(s => ({ id: s.id, name: s.name, lng: s.lng, lat: s.lat })) }));
    if (minimal.some(r => typeof r.id !== 'string' || !['driving', 'walking', 'riding'].includes(r.mode) || r.stops.some(s => typeof s.id !== 'string' || typeof s.name !== 'string' || s.name.length > 160 || !hasCoordinates(s)))) throw new Error('invalid stops');
    const ids = minimal.flatMap(r => r.stops.map(s => s.id));
    if (new Set(ids).size !== ids.length || new Set(minimal.map(r => r.id)).size !== minimal.length || new Set(options.lockedIds).size !== options.lockedIds.length || options.lockedIds.some(id => typeof id !== 'string' || !ids.includes(id))) throw new Error('invalid ids');
    const references = selectedReferences(body.planId, body.referenceIds ?? []);
    const excerpts = referenceExcerpts(references, minimal.flatMap(r => r.stops.map(s => s.name)));
    return await withAIBudget(async () => {
      const { client, config } = await aiClient();
      const result = await client.chat.completions.create({ model: config.model, messages: optimizationMessages(minimal, options, readTravelPrompt(), excerpts), max_tokens: 3000 });
      const content = result.choices[0]?.message.content?.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      if (!content || result.choices[0]?.finish_reason === 'length') throw new Error('empty/truncated');
      return Response.json({ ...validateCandidate(JSON.parse(content), routes, options), referenceExcerpts: excerpts, unmatchedReferenceNames: references.filter(item => !excerpts.some(e => e.sourceId === item.id)).map(item => item.name) });
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.warn('AI candidate failure', error instanceof Error ? { name: error.name, frame: error.stack?.split('\n')[1] } : { name: 'unknown' });
    const detail = error instanceof Error && /^(AI |请先|AI 正忙|invalid|参考资料|旅行计划)/.test(error.message) ? error.message : '服务请求或结构化响应失败';
    return Response.json({ error: `AI 未能生成符合约束的候选：${detail}。原行程已保留。` }, { status: 400 });
  }
}
