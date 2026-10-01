import type Database from 'better-sqlite3';
export function ensureReferenceTable(db: Database.Database) {
  db.exec('CREATE TABLE IF NOT EXISTS ai_references (plan_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(plan_id,id))');
}
