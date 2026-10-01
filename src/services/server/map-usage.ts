import { database } from './database';
import { dataFile } from './data-dir';
import { mapUsageEndpoints, type MapUsageEndpoint, type MapUsageStats } from '@/lib/map-usage';

// Fixed UTC+8 day boundaries, independent of the computer's time zone.
export function mapUsageDay(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const shared = globalThis as typeof globalThis & { __tripMapUsageGaps?: Map<string, number> };
const gaps = shared.__tripMapUsageGaps ??= new Map<string, number>();
function db() {
  const value = database('map-usage.sqlite');
  value.exec(`CREATE TABLE IF NOT EXISTS usage_daily (
    day TEXT NOT NULL, endpoint TEXT NOT NULL, attempts INTEGER NOT NULL,
    first_at INTEGER NOT NULL, PRIMARY KEY(day, endpoint)
  )`);
  return value;
}

// Only fixed endpoint names are stored, never request URLs, keys or trip data.
// A failed telemetry write must not prevent the map request from being sent.
export function recordMapUsage(endpoint: MapUsageEndpoint, now = Date.now()) {
  if (!Object.hasOwn(mapUsageEndpoints, endpoint)) return;
  try {
    db().prepare(`INSERT INTO usage_daily(day,endpoint,attempts,first_at) VALUES (?,?,1,?)
      ON CONFLICT(day,endpoint) DO UPDATE SET attempts=attempts+1, first_at=MIN(first_at,excluded.first_at)`)
      .run(mapUsageDay(now), endpoint, now);
  } catch {
    // Directory resolution can itself fail; tracking the gap is best effort too.
    try { const file = dataFile('map-usage.sqlite'); gaps.set(file, (gaps.get(file) ?? 0) + 1); } catch { /* keep the original request usable */ }
  }
}

export function mapUsageStats(now = Date.now()): MapUsageStats {
  const day = mapUsageDay(now);
  const rows = db().prepare(`SELECT endpoint, SUM(attempts) AS total,
    SUM(CASE WHEN day=? THEN attempts ELSE 0 END) AS today, MIN(first_at) AS firstAt
    FROM usage_daily GROUP BY endpoint`).all(day) as { endpoint: MapUsageEndpoint; today: number; total: number; firstAt: number }[];
  const known = rows.filter(row => Object.hasOwn(mapUsageEndpoints, row.endpoint));
  return {
    day,
    since: known.length ? new Date(Math.min(...known.map(row => row.firstAt))).toISOString() : null,
    today: known.reduce((sum, row) => sum + row.today, 0),
    total: known.reduce((sum, row) => sum + row.total, 0),
    unrecorded: gaps.get(dataFile('map-usage.sqlite')) ?? 0,
    endpoints: (Object.keys(mapUsageEndpoints) as MapUsageEndpoint[]).map(endpoint => {
      const row = known.find(row => row.endpoint === endpoint);
      return { endpoint, today: row?.today ?? 0, total: row?.total ?? 0 };
    }),
  };
}
