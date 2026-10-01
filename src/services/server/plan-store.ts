import { database } from './database';
import { ensureReferenceTable } from './reference-table';
import { parsePlannerData } from '@/lib/transfer';
import type { PlannerData } from '@/lib/types';
export type PlanLibrary = { revision: number; currentId: string; plans: PlannerData[] };
function db() {
  const value = database('data.sqlite');
  value.exec('CREATE TABLE IF NOT EXISTS library (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, value TEXT NOT NULL)');
  ensureReferenceTable(value);
  return value;
}
export function loadLibrary(): PlanLibrary {
  const row = db().prepare('SELECT revision, value FROM library WHERE id=1').get() as { revision: number; value: string } | undefined;
  return row ? { ...JSON.parse(row.value), revision: row.revision } : { revision: 0, currentId: '', plans: [] };
}
export class LibraryConflict extends Error { constructor() { super('另一窗口已保存新版本。当前编辑已保留在本窗口，请先导出，再重新加载。'); } }
export function saveLibrary(input: Record<string, unknown>): PlanLibrary {
  if (!Number.isInteger(input.revision) || !Array.isArray(input.plans) || !input.plans.length || input.plans.length > 200) throw new Error('计划库格式无效或超过 200 个计划');
  const plans = input.plans.map(plan => parsePlannerData(JSON.stringify(plan)).data);
  if (new Set(plans.map(p => p.trip.id)).size !== plans.length || !plans.some(p => p.trip.id === input.currentId)) throw new Error('计划编号重复或当前计划不存在');
  const value = JSON.stringify({ currentId: input.currentId, plans });
  return db().transaction(() => {
    const current = loadLibrary();
    if (current.revision !== input.revision) throw new LibraryConflict();
    if (JSON.stringify({ currentId: current.currentId, plans: current.plans }) === value) return current;
    if (current.revision) db().prepare('INSERT INTO backups(created_at,value) VALUES (?,?)').run(Date.now(), JSON.stringify(current));
    db().prepare('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 20)').run();
    const revision = current.revision + 1;
    db().prepare('INSERT INTO library(id,revision,value) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,value=excluded.value').run(revision, value);
    for (const old of current.plans) if (!plans.some(p => p.trip.id === old.trip.id)) db().prepare('DELETE FROM ai_references WHERE plan_id=?').run(old.trip.id);
    return { revision, currentId: input.currentId as string, plans };
  })();
}
