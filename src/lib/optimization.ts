import type { Day, PlannerData, Route } from './types';
import { normalize } from './planner';

export const MAX_OPTIMIZATION_NOTE_LENGTH = 1000;
export function validateOptimizationNote(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > MAX_OPTIMIZATION_NOTE_LENGTH || value.includes('\0')) throw new Error('AI 自定义语句格式无效，最多 1000 字');
  return value.trim();
}
export type OptimizeOptions = { scope: 'route' | 'day'; objective: 'duration' | 'distance'; fixedStart: boolean; fixedEnd: boolean; lockedIds: string[]; allowRouteReorder: boolean; customInstructions?: string };
export type Candidate = { routes: { id: string; stopIds: string[] }[]; explanation: string };
export function validateCandidate(value: unknown, routes: Route[], options: OptimizeOptions): Candidate {
  if (!value || typeof value !== 'object') throw new Error('AI 未返回有效候选');
  const candidate = value as Candidate;
  if (!Array.isArray(candidate.routes) || candidate.routes.length !== routes.length || typeof candidate.explanation !== 'string' || candidate.explanation.length > 2000) throw new Error('AI 返回格式无效');
  const seen = new Set<string>();
  candidate.routes.forEach((entry, index) => {
    const route = routes.find(r => r.id === entry?.id);
    if (!route || seen.has(route.id) || (!options.allowRouteReorder && route.id !== routes[index].id)) throw new Error('AI 改变了受保护的路线顺序');
    seen.add(route.id);
    if (!Array.isArray(entry.stopIds) || entry.stopIds.length !== route.stops.length || new Set(entry.stopIds).size !== route.stops.length || entry.stopIds.some(id => !route.stops.some(s => s.id === id))) throw new Error('AI 增删或跨路线移动了地点');
    const original = route.stops.map(s => s.id);
    if (options.fixedStart && entry.stopIds[0] !== original[0]) throw new Error('AI 改变了固定起点');
    if (options.fixedEnd && entry.stopIds.at(-1) !== original.at(-1)) throw new Error('AI 改变了固定终点');
    const locked = original.filter(id => options.lockedIds.includes(id));
    if (JSON.stringify(entry.stopIds.filter(id => locked.includes(id))) !== JSON.stringify(locked)) throw new Error('AI 改变了锁定地点的相对顺序');
  });
  return candidate;
}
export function candidateDay(day: Day, candidate: Candidate): Day {
  const replacements = candidate.routes.map(entry => {
    const route = day.routes.find(r => r.id === entry.id)!;
    return { ...route, stops: normalize(entry.stopIds.map(id => route.stops.find(s => s.id === id)!)) };
  });
  let index = 0;
  return { ...day, routes: day.routes.map(route => candidate.routes.some(r => r.id === route.id) ? replacements[index++] : route) };
}
export function applyCandidate(data: PlannerData, expected: string, dayId: string, candidate: Candidate): PlannerData {
  if (JSON.stringify(data) !== expected) throw new Error('行程已编辑，候选已失效，请重新生成');
  return { ...data, trip: { ...data.trip, days: data.trip.days.map(day => day.id === dayId ? candidateDay(day, candidate) : day) } };
}
