'use client';
import { useEffect, useState } from 'react';
import { Route, X } from 'lucide-react';
export function RouteLegend({ bottom, roadsVisible, connectorsVisible, onToggleRoads, onToggleConnectors }: { bottom: number; roadsVisible: boolean; connectorsVisible: boolean; onToggleRoads: () => void; onToggleConnectors: () => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem('trip-map-legend-hidden') !== 'true'); } catch {} }, []);
  const toggle = (value: boolean) => { setOpen(value); try { localStorage.setItem('trip-map-legend-hidden', String(!value)); } catch {} };
  return open ? <aside className="amap-route-legend" style={{ bottom }} aria-label="路线图例">
    <div className="route-legend-heading"><Route size={15} /><strong>路线图例</strong><button title="关闭路线图例" aria-label="关闭路线图例" onClick={() => toggle(false)}><X size={15} /></button></div>
    <div className="route-legend-items"><button aria-pressed={roadsVisible} onClick={onToggleRoads} title={roadsVisible ? '隐藏高德道路' : '显示高德道路'}><i className="legend-road" />高德道路</button><button aria-pressed={connectorsVisible} onClick={onToggleConnectors} title={connectorsVisible ? '隐藏非道路接驳' : '显示非道路接驳'}><i className="legend-connector" />非道路接驳</button></div>
  </aside> : <button className="route-legend-reopen" style={{ bottom }} onClick={() => toggle(true)} aria-label="显示路线图例"><Route size={15} />图例</button>;
}
