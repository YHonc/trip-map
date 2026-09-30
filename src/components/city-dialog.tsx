'use client';
import { mapFetch } from '@/services/map-request';
import { useState } from 'react';
import { Building2, LocateFixed, Search } from 'lucide-react';
import { Modal } from './ui';
import { usePlanner } from '@/hooks/use-planner';
import type { City } from '@/lib/types';
import { effectiveCity } from '@/lib/city';
import { mapService } from '@/services/map-service';

export function CityDialog() {
  const p = usePlanner(), target = p.cityTarget!;
  const day = p.data.trip.days.find(d => d.id === target.dayId);
  const route = day?.routes.find(r => r.id === target.routeId);
  const current = effectiveCity(day, target.routeId);
  const [query, setQuery] = useState(current?.name ?? '');
  const [results, setCityResults] = useState<City[]>([]);
  const [selected, setSelected] = useState<City | undefined>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = async (q: string) => {
    setQuery(q); setBusy(true); setError(''); setCityResults([]);
    try { const response = await mapFetch(`/api/amap/cities?q=${encodeURIComponent(q)}`); const result = await response.json(); if (!response.ok) throw new Error(result.error); setCityResults(result.cities); if (!result.cities.length) setError('没有找到城市，请输入完整城市名，如“杭州市”'); }
    catch (e) { setError(e instanceof Error ? e.message : '查询失败'); } finally { setBusy(false); }
  };
  return <Modal title="旅游城市" onClose={() => p.setCityTarget(null)} className="city-dialog">
    <div className="city-scope"><Building2 size={22} /><div><strong>{day?.name}{route ? ` · ${route.name}` : ' · 当天所有路线'}</strong><p>{route ? '为这条路线单独设置，优先于当天城市' : '当天未单独设置城市的路线会自动继承'}</p></div></div>
    <form className="city-search" onSubmit={e => { e.preventDefault(); void search(query); }}><Search size={18} /><input aria-label="搜索旅游城市" placeholder="输入城市名称，例如上海、杭州" value={query} onChange={e => setQuery(e.target.value)} /><button disabled={busy || !query.trim()}>搜索</button></form>
    <div className="city-popular">{['上海', '北京', '杭州', '成都', '广州', '西安'].map(name => <button key={name} disabled={busy} onClick={() => void search(name)}>{name}</button>)}</div>
    <div className="city-results" role="listbox" aria-label="城市搜索结果">{results.map(city => <button role="option" aria-selected={selected?.adcode === city.adcode} className={selected?.adcode === city.adcode ? 'selected' : ''} key={city.adcode} onClick={() => setSelected(city)}><Building2 size={20} /><span><strong>{city.name}</strong><small>高德行政区 · {city.adcode}</small></span>{selected?.adcode === city.adcode && <span>✓</span>}</button>)}</div>
    {busy && <p className="ai-note">正在查询高德城市…</p>}{error && <p role="alert" className="ai-message">{error}</p>}
    <p className="ai-note">{selected ? `当前选择：${selected.name}。` : ''}地点搜索将限定在该城市，定位按钮回到高德城市中心。已有地点保持原位，不会被迁移或删除。</p>
    <div className="city-actions"><button onClick={() => p.setTravelCity(target.dayId, target.routeId, undefined)}>{route ? '继承当天城市' : '取消城市限制'}</button><button className="primary" disabled={!selected || busy} onClick={() => { if (!selected) return; p.setTravelCity(target.dayId, target.routeId, selected); if (target.routeId) p.selectRouteOnly(target.dayId, target.routeId); else p.selectDayOnly(target.dayId); mapService.panTo(selected, 11); }}><LocateFixed size={16} />设置并定位</button></div>
  </Modal>;
}
