import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

export function dataDirectory() {
  const root = process.env.TRIP_MAP_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'TripMap');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}
export const dataFile = (name: string) => path.join(dataDirectory(), name);
