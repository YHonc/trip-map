import { readMapConfig } from './map-config';
import { checkBudget, waitForAmapSlot } from './amap';
import { markUpstreamRequest } from './request-trace';
import { STATIC_MAP_SIZE, type ExportViewport } from '@/lib/export-map';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export function validateStaticViewport(value: ExportViewport) {
  if (!value?.center || !Number.isFinite(value.center.lng) || !Number.isFinite(value.center.lat) || Math.abs(value.center.lng) > 180 || Math.abs(value.center.lat) > 85.05112878 || !Number.isInteger(value.zoom) || value.zoom < 1 || value.zoom > 16)
    throw new Error('导出底图参数无效');
}
export async function staticMapAmap(viewport: ExportViewport, fetcher: typeof fetch = fetch): Promise<string> {
  validateStaticViewport(viewport);
  const config = readMapConfig();
  if (!config.webKey) throw new Error('请先在地图设置中配置 Web 服务 Key，再导出高德底图');
  checkBudget();
  if (fetcher === fetch) await waitForAmapSlot();
  const url = new URL(`${config.baseURL}/v3/staticmap`);
  url.search = new URLSearchParams({ key: config.webKey, location: `${viewport.center.lng.toFixed(6)},${viewport.center.lat.toFixed(6)}`, zoom: String(viewport.zoom), size: STATIC_MAP_SIZE, scale: '2', traffic: '0' }).toString();
  markUpstreamRequest();
  let response: Response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(20000), cache: 'no-store', redirect: 'error' }); }
  catch { throw new Error('高德底图请求失败，请检查网络或地图服务地址后重试'); }
  if (!response.ok) throw new Error('高德静态地图服务暂不可用，请稍后重试');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new Error('导出底图过大');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('高德没有返回底图');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('导出底图过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  // Accept only an actual PNG at the requested size, not a JSON error or SVG payload.
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('高德未返回有效底图，请检查 Web 服务 Key 的静态地图权限与额度');
  if (bytes.readUInt32BE(16) !== 1600 || bytes.readUInt32BE(20) !== 850)
    throw new Error('底图尺寸与路线图不匹配，请检查高德兼容服务的高清静态地图支持');
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
