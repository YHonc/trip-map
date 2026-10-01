import { randomUUID } from 'node:crypto';
import { MAX_REFERENCE_BYTES, MAX_REFERENCE_COUNT, MAX_SELECTED_REFERENCES, type ReferenceInfo, type TravelReference } from '@/lib/travel-references';
import { database } from './database';
import { loadLibrary } from './plan-store';
import { ensureReferenceTable } from './reference-table';

function db() { const value = database('data.sqlite'); ensureReferenceTable(value); return value; }
function plan(value: unknown): string {
  if (typeof value !== 'string' || !loadLibrary().plans.some(p => p.trip.id === value)) throw new Error('旅行计划不存在，请先保存计划');
  return value;
}
const metadata = 'id, name, length(text) AS chars, created_at AS createdAt';
export function listReferences(planId: unknown): ReferenceInfo[] {
  return db().prepare(`SELECT ${metadata} FROM ai_references WHERE plan_id=? ORDER BY created_at,id`).all(plan(planId)) as ReferenceInfo[];
}
export function getReference(planId: unknown, id: unknown): TravelReference {
  if (typeof id !== 'string') throw new Error('参考资料编号无效');
  const row = db().prepare(`SELECT ${metadata}, text FROM ai_references WHERE plan_id=? AND id=?`).get(plan(planId), id) as TravelReference | undefined;
  if (!row) throw new Error('参考资料不存在或不属于当前计划');
  return row;
}
export function addReference(planId: unknown, name: unknown, text: unknown): ReferenceInfo {
  if (typeof name !== 'string' || !name.trim() || name.length > 160 || typeof text !== 'string' || !text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('请填写有效的攻略名称和正文，或上传包含正文的 TXT 文本');
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const bytes = Buffer.byteLength(normalized);
  if (bytes > MAX_REFERENCE_BYTES) throw new Error('每份攻略正文最大 100 KB');
  return db().transaction(() => {
    const key = plan(planId);
    const totals = db().prepare('SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM ai_references WHERE plan_id=?').get(key) as { count: number; bytes: number };
    if (totals.count >= MAX_REFERENCE_COUNT || totals.bytes + bytes > 1024 * 1024) throw new Error('每个计划最多 20 份攻略、合计 1 MB');
    const id = randomUUID(), createdAt = Date.now();
    db().prepare('INSERT INTO ai_references(plan_id,id,name,text,bytes,created_at) VALUES (?,?,?,?,?,?)').run(key, id, name.trim(), normalized, bytes, createdAt);
    return { id, name: name.trim(), chars: normalized.length, createdAt };
  })();
}
export function deleteReference(planId: unknown, id: unknown) {
  return db().transaction(() => {
    const item = getReference(planId, id);
    db().prepare('DELETE FROM ai_references WHERE plan_id=? AND id=?').run(planId, item.id);
    return { deleted: item.id };
  })();
}
export function selectedReferences(planId: unknown, ids: unknown): TravelReference[] {
  if (!Array.isArray(ids) || ids.length > MAX_SELECTED_REFERENCES || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('参考资料选择无效，每次最多 8 份');
  if (!ids.length) return [];
  return db().transaction(() => ids.map(id => getReference(planId, id)))();
}
