export async function aiRequest(path: string, body?: unknown, method = 'POST', signal?: AbortSignal) {
  const response = await fetch(`/api/ai/${path}`, { method: body === undefined ? 'GET' : method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result;
}
