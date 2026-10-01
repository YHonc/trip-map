import Database from 'better-sqlite3';
import { dataFile } from './data-dir';
const connections = new Map<string, Database.Database>();
export function database(name: 'data.sqlite' | 'map-cache.sqlite' | 'map-usage.sqlite') {
  const file = dataFile(name);
  let db = connections.get(file);
  if (!db) {
    db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = FULL');
    connections.set(file, db);
  }
  return db;
}
