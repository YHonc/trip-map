import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dataFile } from './data-dir';

// DPAPI uses the current Windows account. Secrets travel through stdin, never command arguments.
function dpapi(value: string, decrypt: boolean) {
  const script = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::${decrypt ? 'Unprotect' : 'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: value, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error('Windows 密钥保护失败，请检查当前账户权限');
  return result.stdout.trim();
}
const protect = (value: string) => value && process.platform === 'win32' ? `dpapi:${dpapi(Buffer.from(value).toString('base64'), false)}` : value;
const unprotect = (value: string) => value.startsWith('dpapi:') ? Buffer.from(dpapi(value.slice(6), true), 'base64').toString('utf8') : value;
const memo = new Map<string, { mtime: number; value: Record<string, unknown> }>();
export function readConfigFile<T>(name: string, secrets: string[]): T | undefined {
  const file = dataFile(name);
  if (!existsSync(file)) return undefined;
  const mtime = statSync(file).mtimeMs;
  const known = memo.get(file);
  if (known?.mtime === mtime) return structuredClone(known.value) as T;
  const value = JSON.parse(readFileSync(file, 'utf8'));
  for (const key of secrets) if (typeof value[key] === 'string') value[key] = unprotect(value[key]);
  memo.set(file, { mtime, value });
  return structuredClone(value) as T;
}
export function writeConfigFile<T extends object>(name: string, value: T, secrets: string[]) {
  const file = dataFile(name);
  const stored = { ...value } as Record<string, unknown>;
  for (const key of secrets) if (typeof stored[key] === 'string') stored[key] = protect(stored[key] as string);
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(stored, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
  memo.delete(file);
}
