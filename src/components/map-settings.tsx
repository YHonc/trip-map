'use client';
import { useEffect, useState } from 'react';
import { Modal } from './ui';
import { GlassSelect } from './glass-select';
import { usePlanner } from '@/hooks/use-planner';
import type { PublicMapConfig, CacheKind } from '@/lib/map-config';

type Config = PublicMapConfig & { dataDirectory: string };
type Stats = { groups: { kind: CacheKind; entries: number; bytes: number; latest: number }[]; counters: Record<string, number>; fileBytes: number; basemap: string };
const kinds: [CacheKind, string][] = [['city', '城市信息'], ['search', '地点搜索'], ['driving', '驾车路线'], ['walking', '步行路线'], ['riding', '骑行路线']];
async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/amap/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作失败');
  return result;
}
export function MapSettings({ onClose }: { onClose: () => void }) {
  const p = usePlanner();
  const [config, setConfig] = useState<Config | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [webKey, setWebKey] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [tab, setTab] = useState('config');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  useEffect(() => { void Promise.all([api('config'), api('cache')]).then(([c, s]) => { setConfig(c); setStats(s); }).catch(e => setMessage(e.message)); }, []);
  const perform = async (run: () => Promise<void>) => { if (busy) return; setBusy(true); setMessage(''); try { await run(); } catch (e) { setMessage(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); } };
  const reload = async () => { if (!await p.flushSave()) throw new Error('行程尚未保存，请先导出备份后重新打开'); location.reload(); };
  const save = async (clear = false) => {
    if (!config) throw new Error('配置尚未加载');
    if (!await p.flushSave()) throw new Error('请先保存或导出当前行程');
    const result = await api('config', { ...config, webKey, securityCode, ...(clear ? { clearWebKey: true, clearSecurityCode: true, clearJsKey: true, provider: 'mock' } : {}) });
    setConfig(result); setWebKey(''); setSecurityCode(''); setChanged(true);
  };
  return <Modal title="地图设置" onClose={() => { if (busy) return; if (changed) void perform(reload); else onClose(); }} className="ai-dialog map-settings">
    <div className="ai-tabs"><button className={tab === 'config' ? 'active' : ''} onClick={() => setTab('config')}>地图 API</button><button className={tab === 'cache' ? 'active' : ''} onClick={() => setTab('cache')}>缓存与数据</button></div>
    {config && <div className="ai-form"><fieldset disabled={busy}>
      {tab === 'config' ? <>
        <label>地图模式<GlassSelect label="地图模式" value={config.provider} onChange={provider => setConfig({ ...config, provider: provider as 'mock' | 'amap' })} options={[{ value: 'mock', label: '演示地图（无需 Key）' }, { value: 'amap', label: '高德地图' }]} /></label>
        <label>高德 JS API Key<input value={config.jsKey} autoComplete="off" onChange={e => setConfig({ ...config, jsKey: e.target.value })} placeholder="Web 端 JS API 2.0 Key" /></label>
        <label>JS API 安全密钥<input type="password" value={securityCode} autoComplete="new-password" onChange={e => setSecurityCode(e.target.value)} placeholder={config.hasSecurityCode ? '已保存 · 留空保留' : '与 JS Key 对应的安全密钥'} /></label>
        <label>Web 服务 Key<input type="password" value={webKey} autoComplete="new-password" onChange={e => setWebKey(e.target.value)} placeholder={config.hasWebKey ? '已保存 · 留空保留' : '用于搜索、城市与道路规划'} /></label>
        <details><summary>高级：高德兼容服务地址</summary><label>Web 服务地址<input value={config.baseURL} onChange={e => setConfig({ ...config, baseURL: e.target.value })} /></label><p className="ai-note">仅支持高德响应格式的服务或网关。更换地址会清除旧 Web 服务 Key，需要重新填写；SDK 底图仍使用高德官方服务。</p></details>
        <p className="ai-note">JS Key 会交给地图 SDK；服务密钥仅在本机保存，Windows 使用当前账户加密。保存后重新加载即可生效，无需重新打包。</p>
        <div className="ai-actions"><button onClick={() => void perform(async () => { await save(); await reload(); })}>保存并应用</button><button onClick={() => void perform(async () => { await save(); setMessage((await api('test', {})).message); })}>保存并测试 Web 服务</button><button onClick={() => void perform(async () => { await save(true); await reload(); })}>清除全部 Key</button></div>
        <p className="ai-note">连接测试会发出一次城市查询；底图 Key 与域名限制通过实际地图加载验证。</p>
      </> : <>
        <label className="cache-toggle"><input type="checkbox" checked={config.cache.enabled} onChange={e => setConfig({ ...config, cache: { ...config.cache, enabled: e.target.checked } })} />启用 SQLite 磁盘缓存（关闭程序后保留）</label>
        <label>缓存内容上限（MB）<input type="number" min="8" max="1024" value={config.cache.maxMB} onChange={e => setConfig({ ...config, cache: { ...config.cache, maxMB: Number(e.target.value) } })} /></label>
        <div className="cache-table"><div className="cache-row cache-head"><span>类别</span><span>有效期 / 分钟</span><span>有效条目</span><span>内容大小</span></div>{kinds.map(([kind, label]) => { const group = stats?.groups.find(g => g.kind === kind); return <div className="cache-row" key={kind}><label htmlFor={`ttl-${kind}`}>{label}</label><input id={`ttl-${kind}`} type="number" min="1" max="43200" value={config.cache.ttl[kind]} onChange={e => setConfig({ ...config, cache: { ...config.cache, ttl: { ...config.cache.ttl, [kind]: Number(e.target.value) } } })} /><span>{group?.entries ?? 0}</span><span>{((group?.bytes ?? 0) / 1024).toFixed(1)} KB</span></div>; })}</div>
        <p className="ai-note">默认：城市 7 天、搜索与步行/骑行 1 天、驾车 15 分钟。请按账号的数据保存授权调整或关闭；不缓存失败结果，不代表实时路况。</p>
        <div className="cache-counters"><span>服务内存命中 <b>{stats?.counters.memory ?? 0}</b></span><span>磁盘命中 <b>{stats?.counters.disk ?? 0}</b></span><span>请求合并 <b>{stats?.counters.merged ?? 0}</b></span><span>缓存未命中 <b>{stats?.counters.upstream ?? 0}</b></span></div>
        <div className="ai-actions"><button onClick={() => void perform(async () => { await save(); await reload(); })}>保存缓存策略</button><button onClick={() => void perform(async () => { setStats(await api('cache')); })}>刷新统计</button><button onClick={() => void perform(async () => { if (!await p.flushSave()) throw new Error('请先保存行程'); setStats(await api('cache', {})); await reload(); })}>清空缓存并重新获取</button></div>
        <p className="ai-note">清空操作只影响地图缓存；重载后当前行程的道路会重新请求。统计不包含高德 SDK 底图请求，也不是账单。</p>
        <p className="ai-note">底图：{stats?.basemap}</p>
        <label>统一用户数据目录<output className="data-path">{config.dataDirectory}</output></label>
        <button onClick={() => void perform(async () => { await p.importBrowserPlans(); setMessage('旧计划已加入计划库，原浏览器记录保持不变。'); })}>导入此浏览器的旧版计划</button>
        <p className="ai-note">安装版、便携版与本机网页共用此目录。便携版免安装，数据保留在当前 Windows 账户中。旧浏览器计划首次自动迁移；已有计划库时可通过 JSON 导入旧计划。</p>
      </>}
    </fieldset></div>}
    {changed && <button className="ai-primary" disabled={busy} onClick={() => void perform(reload)}>重新加载并应用已保存设置</button>}
    {message && <p className="ai-message" role="status">{message}</p>}
  </Modal>;
}
