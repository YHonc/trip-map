export function localRequest(request: Request) {
  const url = new URL(request.url);
  const host = new URL(`${url.protocol}//${request.headers.get('host')}`);
  const allowed = ['127.0.0.1', 'localhost', '[::1]'];
  if (!allowed.includes(url.hostname) || !allowed.includes(host.hostname)) throw new Error('接口仅限本机使用');
  const origin = request.headers.get('origin');
  if ((origin && origin !== host.origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('不允许跨站请求');
}
export async function jsonBody(request: Request, max = 60_000): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('需要 JSON 请求');
  const text = await request.text();
  if (Buffer.byteLength(text) > max) throw new Error('请求内容过大');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求格式无效');
  return value;
}
export const noStore = { 'Cache-Control': 'no-store' };
