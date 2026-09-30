import type { PlannerData } from '@/lib/types';
import { parsePlannerData } from '@/lib/transfer';
export type SavedLibrary = { revision: number; currentId: string; plans: PlannerData[] };
export async function readLibrary(): Promise<SavedLibrary> {
  const response = await fetch('/api/plans', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '无法读取计划库');
  return result;
}
export async function writeLibrary(value: SavedLibrary): Promise<SavedLibrary> {
  const response = await fetch('/api/plans', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '计划保存失败');
  return result;
}
export function legacyLibrary(): { currentId: string; plans: PlannerData[] } | undefined {
  const raw = localStorage.getItem('trip-map-v2') ?? localStorage.getItem('trip-map-v1');
  const library = localStorage.getItem('trip-map-plans-v1');
  if (!raw && !library) return undefined;
  // Preserve exact source before migration. Never remove or overwrite old browser keys.
  if (!localStorage.getItem('trip-map-before-sqlite')) localStorage.setItem('trip-map-before-sqlite', JSON.stringify({ raw, library }));
  const plans = library ? (JSON.parse(library) as unknown[]).map(p => parsePlannerData(JSON.stringify(p)).data) : [];
  const current = raw ? parsePlannerData(raw).data : plans[0];
  if (!current) return undefined;
  return { currentId: current.trip.id, plans: [...plans.filter(p => p.trip.id !== current.trip.id), current] };
}
declare global { interface Window { tripMapFlush?: () => Promise<boolean>; } }
