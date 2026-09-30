'use client';
import { useEffect, useRef, useState } from 'react';
import { Cpu, RefreshCw, Plug, Sparkles } from 'lucide-react';
import { Modal } from './ui';
import { usePlanner } from '@/hooks/use-planner';
import { applyCandidate, candidateDay, validateCandidate, type Candidate, type OptimizeOptions } from '@/lib/optimization';
import { optimizationCost, type OptimizationCost } from '@/services/optimization-cost';
import { dayConnections } from '@/lib/connections';
import { GlassSelect } from './glass-select';

async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/ai/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result;
}
type Config = { protocol: 'openai'; baseURL: string; model: string; hasKey: boolean };
type Preview = { snapshot: string; candidate: Candidate; before: OptimizationCost; after: OptimizationCost; dayId: string; improved: boolean };
const initialOptions: OptimizeOptions = { scope: 'route', objective: 'duration', fixedStart: true, fixedEnd: true, lockedIds: [], allowRouteReorder: false };
export function AIDialog({ onClose }: { onClose: () => void }) {
  const p = usePlanner();
  const [tab, setTab] = useState<'optimize' | 'config'>('optimize');
  const [config, setConfig] = useState<Config | null>(null);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [options, setOptions] = useState(initialOptions);
  const [routeId, setRouteId] = useState(p.selection.activeRouteId ?? '');
  const [dayId, setDayId] = useState(p.selection.activeDayId ?? p.data.trip.days[0]?.id ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const latest = useRef(p.data); latest.current = p.data;
  useEffect(() => { void api('config').then(setConfig).catch(e => setMessage(e.message)); return () => { generation.current++; }; }, []);
  const day = p.data.trip.days.find(d => d.id === dayId);
  const selected = day?.routes.filter(r => options.scope === 'day' || r.id === routeId) ?? [];
  const stale = preview && preview.snapshot !== JSON.stringify(p.data);
  const change = (patch: Partial<OptimizeOptions>) => { generation.current++; setOptions(o => ({ ...o, ...patch })); setPreview(null); };
  const perform = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!config) throw new Error('配置尚未加载');
    const saved = await api('config', { ...config, apiKey: key }); setConfig(saved); setKey('');
  };
  const generate = () => perform(async () => {
    if (!day || !selected.length || (selected.every(r => r.stops.length < 3) && !(options.allowRouteReorder && selected.length > 1))) throw new Error('请选择至少有三个地点的路线，或允许同 Day 多路线重排');
    if (selected.length > 8 || selected.reduce((n, r) => n + r.stops.length, 0) > 40) throw new Error('一次最多优化 8 条路线、40 个地点，请缩小范围');
    if (!config?.hasKey) { setTab('config'); throw new Error('请先配置 AI 服务'); }
    const snapshot = JSON.stringify(p.data), id = ++generation.current;
    const current = () => generation.current === id && JSON.stringify(latest.current) === snapshot;
    setPreview(null); setMessage('正在核算原方案…');
    const before = await optimizationCost(day, selected.map(r => r.id), current);
    if (!current()) throw new Error('行程已修改，请重新生成');
    setMessage('AI 正在建议地点顺序…');
    const candidate = validateCandidate(await api('optimize', { routes: selected, options }), selected, options);
    if (!current()) throw new Error('行程已修改，请重新生成');
    setMessage('正在用高德核验候选道路及转场…');
    const after = await optimizationCost(candidateDay(day, candidate), selected.map(r => r.id), current);
    if (!current()) throw new Error('行程已修改，请重新生成');
    const improved = after[options.objective] < before[options.objective] - (options.objective === 'duration' ? 1 : 1);
    setPreview({ snapshot, candidate, before, after, dayId: day.id, improved });
    setMessage(improved ? '候选已通过地点、约束及高德道路核验；这是一份启发式建议。' : '候选未改善所选目标，保留原方案。可尝试调整约束。');
  });
  const cost = (value: OptimizationCost) => `${(value.distance / 1000).toFixed(2)} 公里 · ${Math.round(value.duration / 60)} 分钟`;
  return <Modal title="AI 路线助手" onClose={onClose} className="ai-dialog">
    <div className="ai-tabs"><button className={tab === 'optimize' ? 'active' : ''} onClick={() => setTab('optimize')}><Sparkles size={16} />优化路线</button><button className={tab === 'config' ? 'active' : ''} onClick={() => setTab('config')}><Cpu size={16} />AI 配置</button></div>
    {tab === 'config' ? <div className="ai-form">
      <p className="ai-note">密钥仅保存在本机服务端，不写入行程文件。请求由本机转发给你配置的模型服务。更换 API 地址后须重新填写密钥。</p>
      {config && <>
        <label>模型协议<GlassSelect label="模型协议" value={config.protocol} disabled options={[{value:'openai',label:'OpenAI 兼容'}]} onChange={() => {}} /></label>
        <label>API 地址<input value={config.baseURL} onChange={e => setConfig({ ...config, baseURL: e.target.value })} placeholder="http://127.0.0.1:8317/v1" /></label>
        <label>API Key<input type="password" autoComplete="off" value={key} placeholder={config.hasKey ? '已配置 · 留空保留现有密钥' : '填写 API Key'} onChange={e => setKey(e.target.value)} /></label>
        <label>默认模型<div className="ai-model"><input value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })} /><button aria-label="刷新模型列表" disabled={busy} onClick={() => void perform(async () => { await save(); setModels((await api('models', {})).models); setMessage('模型列表已更新'); })}><RefreshCw size={17} /></button></div></label>
        {models.length > 0 && <GlassSelect label="从服务模型列表选择" value={config.model} onChange={model => setConfig({ ...config, model })} options={models.map(model => ({ value: model, label: model }))} />}
        <div className="ai-actions"><button disabled={busy} onClick={() => void perform(async () => { await save(); setMessage('配置已保存'); })}>保存配置</button><button disabled={busy} onClick={() => void perform(async () => { await save(); await api('test', {}); setMessage('连接成功，所选模型已响应'); })}><Plug size={16} />测试连接</button><button disabled={busy} onClick={() => void perform(async () => { setConfig(await api('config', { ...config, clearKey: true })); setKey(''); setMessage('密钥已清除'); })}>清除密钥</button></div>
      </>}
    </div> : <div className="ai-form">
      <p className="ai-note">生成建议会将所选路线的地点名称、ID、坐标及交通方式发送给配置的 AI 服务。高德核算道路距离与预计时间；不推测营业时间。</p>
      <fieldset disabled={busy}>
        <div className="ai-grid"><label>日期范围<GlassSelect label="日期范围" value={dayId} disabled={busy} onChange={value => { setDayId(value); setRouteId(p.data.trip.days.find(d => d.id === value)?.routes[0]?.id ?? ''); change({ lockedIds: [] }); }} options={p.data.trip.days.map(d => ({ value: d.id, label: d.name, detail: `${d.date} · ${d.routes.length} 条路线` }))} /></label><label>优化范围<GlassSelect label="优化范围" value={options.scope} disabled={busy} onChange={value => change({ scope: value as OptimizeOptions['scope'], allowRouteReorder: false, lockedIds: [] })} options={[{ value: 'route', label: '单条路线', detail: '仅调整选中路线内的地点顺序' }, { value: 'day', label: '同 Day 各路线联合建议', detail: '同时考虑当天路线与转场' }]} /></label></div>
        {options.scope === 'route' && <label>路线<GlassSelect label="路线" value={routeId} disabled={busy} onChange={value => { setRouteId(value); change({ lockedIds: [] }); }} options={(day?.routes ?? []).map(r => ({ value: r.id, label: r.name, detail: `${{ driving: '驾车', walking: '步行', riding: '骑行' }[r.mode]} · ${r.stops.length} 个地点` }))} /></label>}
        <label>优化目标<GlassSelect label="优化目标" value={options.objective} disabled={busy} onChange={value => change({ objective: value as OptimizeOptions['objective'] })} options={[{ value: 'duration', label: '优先减少预计交通时间', detail: '以高德预计耗时比较方案' }, { value: 'distance', label: '优先减少道路距离', detail: '以真实道路总长度比较方案' }]} /></label>
        <div className="ai-checks"><label><input type="checkbox" checked={options.fixedStart} onChange={e => change({ fixedStart: e.target.checked })} />固定各路线起点</label><label><input type="checkbox" checked={options.fixedEnd} onChange={e => change({ fixedEnd: e.target.checked })} />固定各路线终点</label>{options.scope === 'day' && <label><input type="checkbox" checked={options.allowRouteReorder} onChange={e => change({ allowRouteReorder: e.target.checked })} />允许调整路线顺序</label>}</div>
        <details><summary>锁定地点相对顺序 · {options.lockedIds.length} 个</summary><div className="ai-locks">{selected.flatMap(r => r.stops.map(s => <label key={s.id}><input type="checkbox" checked={options.lockedIds.includes(s.id)} onChange={e => change({ lockedIds: e.target.checked ? [...options.lockedIds, s.id] : options.lockedIds.filter(id => id !== s.id) })} />{r.name} · {s.name}</label>))}</div></details>
        <p className="ai-note">沿用各路线交通方式及已有相邻转场设置。若允许路线重排，新相邻转场默认开启并继承前一条路线的交通方式，具体变化会在预览显示。不跨天、不跨路线移动地点，不增删地点。最多 8 条路线、40 个地点。</p>
      </fieldset>
      <button className="ai-primary" disabled={busy || !selected.length} onClick={() => void generate()}><Sparkles size={16} />{busy ? '正在生成与核验…' : '生成 AI 建议'}</button>
      {preview && <section className="ai-preview"><h3>方案比较</h3><p className="ai-note">包含所选路线及相邻已启用转场；交通时间为高德估计，不含停留与非道路接驳。</p><div className="ai-grid"><div>原方案<strong>{cost(preview.before)}</strong><small>其中转场 {(preview.before.transferDistance / 1000).toFixed(2)} 公里 / {Math.round(preview.before.transferDuration / 60)} 分钟</small></div><div>候选方案<strong>{cost(preview.after)}</strong><small>其中转场 {(preview.after.transferDistance / 1000).toFixed(2)} 公里 / {Math.round(preview.after.transferDuration / 60)} 分钟</small></div></div>
        {preview.candidate.routes.map(entry => { const r = day?.routes.find(r => r.id === entry.id); return <div key={entry.id} className="ai-order"><b>{r?.name}</b><p>原：{r?.stops.map(s => s.name).join(' → ')}</p><p>建议：{entry.stopIds.map(id => r?.stops.find(s => s.id === id)?.name).join(' → ')}</p></div>; })}
        {day && !stale && <details><summary>查看转场变化（包含关闭的转场）</summary>{[day, candidateDay(day, preview.candidate)].map((d, i) => <div key={i}><b>{i ? '候选方案' : '原方案'}</b>{dayConnections(d).map(c => <p key={c.id}>{c.from.name} → {c.to.name}：{c.enabled ? { driving: '驾车', walking: '步行', riding: '骑行' }[c.mode] : '关闭'}</p>)}</div>)}</details>}
        <p>{preview.candidate.explanation}</p>{stale && <p role="alert">行程已编辑，候选已失效，请重新生成。</p>}
        <button className="ai-primary" disabled={!!stale || !preview.improved || busy} onClick={() => { if (JSON.stringify(p.data) !== preview.snapshot) return; p.commit(current => JSON.stringify(current) === preview.snapshot ? applyCandidate(current, preview.snapshot, preview.dayId, preview.candidate) : current); p.setToast('AI 建议已应用，可一次撤销'); onClose(); }}>应用建议 · 可撤销</button>
      </section>}
    </div>}
    {message && <p className="ai-message" role="status">{message}</p>}
  </Modal>;
}
