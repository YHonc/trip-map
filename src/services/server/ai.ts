import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfigFile, writeConfigFile } from './config-file';
export { localRequest } from './local-http';

type AIConfig = { protocol: 'openai'; baseURL: string; apiKey: string; model: string };
export async function readAIConfig(): Promise<AIConfig> {
  const saved = readConfigFile<AIConfig>('ai-config.json', ['apiKey']);
  if (saved) return saved;
  try {
    const old = JSON.parse(await readFile(path.join(process.env.TRIP_MAP_LEGACY_DIR || process.cwd(), '.local', 'ai-config.json'), 'utf8')) as AIConfig;
    writeConfigFile('ai-config.json', old, ['apiKey']);
    return old;
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('本机 AI 配置无法读取'); }
  return { protocol: 'openai', baseURL: process.env.AI_BASE_URL || 'http://127.0.0.1:8317/v1', apiKey: process.env.AI_API_KEY || '', model: process.env.AI_MODEL || 'gemini-3.8-flash-high' };
}
export async function publicAIConfig() {
  const config = await readAIConfig();
  return { protocol: config.protocol, baseURL: config.baseURL, model: config.model, hasKey: !!config.apiKey };
}
export async function saveAIConfig(value: Record<string, unknown>) {
  const current = await readAIConfig();
  if (value.protocol !== 'openai' || typeof value.baseURL !== 'string' || typeof value.model !== 'string' || !value.model.trim() || value.model.length > 120) throw new Error('请填写有效协议、地址和模型');
  const url = new URL(value.baseURL);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('API 地址须为 HTTPS 或本机 HTTP 地址');
  const baseURL = value.baseURL.replace(/\/+$/, '');
  const config: AIConfig = { protocol: 'openai', baseURL, model: value.model.trim(), apiKey: value.clearKey === true ? '' : (typeof value.apiKey === 'string' && value.apiKey ? value.apiKey : baseURL === current.baseURL ? current.apiKey : '') };
  if (config.apiKey.length > 4096 || /[\r\n]/.test(config.apiKey)) throw new Error('密钥格式无效');
  writeConfigFile('ai-config.json', config, ['apiKey']);
  return publicAIConfig();
}
export async function aiClient() {
  const config = await readAIConfig();
  if (!config.apiKey) throw new Error('请先在 AI 配置中填写密钥');
  return { config, client: new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: 45_000, maxRetries: 0, fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }) }) };
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('需要 JSON 请求');
  const body = await request.text();
  if (body.length > 60_000) throw new Error('请求内容过大');
  return JSON.parse(body);
}
let active = false;
let lastCall = 0;
export async function withAIBudget<T>(run: () => Promise<T>) {
  if (active || Date.now() - lastCall < 2000) throw new Error('AI 正忙，请稍后重试');
  active = true; lastCall = Date.now();
  try { return await run(); } finally { active = false; }
}
