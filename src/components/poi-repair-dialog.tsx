'use client';
import { useRef, useState, useEffect } from 'react';
import { Search, MapPin } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { applyRepairs, repairGroups } from '@/lib/poi-repair';
import type { Place } from '@/lib/types';
import { mapService } from '@/services/map-service';
import { Modal } from './ui';
import { GlassSelect } from './glass-select';
export function PoiRepairDialog() {
  const p = usePlanner();
  const [snapshot] = useState(() => JSON.stringify(p.data));
  const [groups] = useState(() => repairGroups(p.data));
  const [results, setResults] = useState<Record<string, Place[]>>({});
  const [choices, setChoices] = useState<Record<string, Place>>({});
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const stale = JSON.stringify(p.data) !== snapshot;
  const searchOne = async (group: typeof groups[number]) => {
    setChoices(old => { const next = { ...old }; delete next[group.key]; return next; });
    setErrors(old => ({ ...old, [group.key]: '' }));
    const query = queries[group.key] ?? `${group.stop.name} ${group.stop.address}`;
    try {
      let places = await mapService.searchPlace(query, group.city?.adcode);
      if (!places.length && !queries[group.key]) places = await mapService.searchPlace(group.stop.name, group.city?.adcode);
      if (alive.current) { setResults(old => ({ ...old, [group.key]: places })); setErrors(old => ({ ...old, [group.key]: places.length ? '' : '无结果，请调整搜索词' })); }
    } catch (e) { if (alive.current) setErrors(old => ({ ...old, [group.key]: e instanceof Error ? e.message : '搜索失败' })); }
  };
  const searchAll = async () => { setBusy(true); for (const group of groups) { if (!alive.current) break; await searchOne(group); } if (alive.current) setBusy(false); };
  const count = groups.reduce((n, g) => n + (choices[g.key] ? g.stopIds.length : 0), 0);
  return <Modal title="重新确认行程地点" onClose={() => p.setRepairOpen(false)} className="repair-dialog">
    <p className="ai-note">搜索并选择高德 POI，名称、地址、坐标以高德为准。同地点的旧收藏同步更新，每次访问保留独立编号。未选择项保持原样，可一次撤销。</p>
    <button className="repair-search-all" disabled={busy || stale} onClick={() => void searchAll()}><Search size={16} />{busy ? '正在搜索高德地点…' : `搜索全部 ${groups.length} 个不同地点`}</button>
    <div className="repair-list">{groups.map(group => <section className="repair-row" key={group.key}>
      <div className="repair-title"><MapPin size={17} /><strong>{group.stop.name}</strong><small>{group.stopIds.length} 次访问{group.city ? ` · ${group.city.name}` : ''}</small></div><p>{group.stop.address}</p>
      <div className="city-search"><input aria-label={`搜索确认 ${group.stop.name}`} value={queries[group.key] ?? `${group.stop.name} ${group.stop.address}`} onChange={e => setQueries(old => ({ ...old, [group.key]: e.target.value }))} /><button disabled={busy || stale} onClick={() => { setBusy(true); void searchOne(group).finally(() => { if (alive.current) setBusy(false); }); }}>搜索</button></div>
      <GlassSelect label={`替换 ${group.stop.name}`} placeholder="选择核实后的高德地点" value={choices[group.key]?.id ?? ''} disabled={busy || stale || !results[group.key]?.length} options={(results[group.key] ?? []).map(place => ({ value: place.id, label: place.name, detail: place.address }))} onChange={id => { const place = results[group.key]?.find(p => p.id === id); if (place) setChoices(old => ({ ...old, [group.key]: place })); }} />
      {errors[group.key] && <p role="alert">{errors[group.key]}</p>}
    </section>)}</div>
    {stale && <p role="alert">行程已修改，请关闭后重新确认。</p>}
    <div className="city-actions"><span>已选 {count} / {groups.reduce((n,g) => n + g.stopIds.length, 0)} 个地点</span><button className="primary" disabled={!count || busy || stale} onClick={() => {
      try { if (!localStorage.getItem('trip-map-before-poi-repair')) localStorage.setItem('trip-map-before-poi-repair', snapshot); }
      catch { p.setToast('无法备份原行程，请先导出 JSON 后重试'); return; }
      p.commit(current => JSON.stringify(current) === snapshot ? applyRepairs(current, snapshot, groups, choices) : current); p.setRepairOpen(false); p.setSelectedPlace(null); p.setToast(`已确认 ${count} 个高德地点，路线将重新生成，可撤销`);
    }}>应用替换并生成路线</button></div>
  </Modal>;
}
