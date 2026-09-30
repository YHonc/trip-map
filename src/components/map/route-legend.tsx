'use client';
import { useEffect, useState } from 'react';
import { Route, X } from 'lucide-react';
export function RouteLegend({ bottom }: { bottom: number }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem('trip-map-legend-hidden') !== 'true'); } catch {} }, []);
  const toggle = (value: boolean) => { setOpen(value); try { localStorage.setItem('trip-map-legend-hidden', String(!value)); } catch {} };
  return open ? <aside className="amap-route-legend" style={{ bottom }} aria-label="路线图例">
    <div className="route-legend-heading"><Route size={15} /><strong>路线图例</strong><button title="关闭路线图例" aria-label="关闭路线图例" onClick={() => toggle(false)}><X size={15} /></button></div>
    <div className="route-legend-items"><span><i className="legend-road" />高德道路</span><span><i className="legend-transfer" />转场</span><span><i className="legend-connector" />非道路接驳</span></div>
    <p>非道路接驳不计入路程</p>
  </aside> : <button className="route-legend-reopen" style={{ bottom }} onClick={() => toggle(true)} aria-label="显示路线图例"><Route size={15} />图例</button>;
}
