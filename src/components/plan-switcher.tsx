'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, PencilLine, Plus, Trash2 } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { IconButton } from './ui';

export function PlanSwitcher() {
  const p = usePlanner();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const act = (action: () => void) => { setOpen(false); trigger.current?.focus(); action(); };
  return <div className="plan-switcher" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}>
    <button ref={trigger} className="plan-switcher-trigger" aria-label="切换或管理旅行计划" aria-expanded={open} aria-controls="plan-switcher-panel" onClick={() => setOpen(!open)}><span>{p.data.trip.name}</span><ChevronDown size={17} /></button>
    {open && <div id="plan-switcher-panel" ref={panel} className="plan-switcher-panel glass" role="region" aria-label="旅行计划">
      <div className="plan-switcher-heading">我的旅行<span>{p.plans.length} 个计划</span></div>
      <div className="plan-switcher-list">{p.plans.map(plan => <div className={`plan-switcher-row ${plan.trip.id === p.data.trip.id ? 'active' : ''}`} key={plan.trip.id}>
        <button className="plan-switcher-select" aria-current={plan.trip.id === p.data.trip.id ? 'true' : undefined} onClick={() => act(() => p.switchPlan(plan.trip.id))}><strong>{plan.trip.name}</strong><small>{plan.trip.days.length} 天 · {plan.trip.days.flatMap(day => day.routes).reduce((n, route) => n + route.stops.length, 0)} 个地点</small></button>
        {plan.trip.id === p.data.trip.id && <Check className="plan-active-check" size={14} />}
        <div className="plan-row-actions"><IconButton label={`重命名计划：${plan.trip.name}`} onClick={() => act(() => p.renamePlan(plan.trip.id))}><PencilLine size={15} /></IconButton><IconButton className="plan-delete" label={`删除计划：${plan.trip.name}`} onClick={() => act(() => p.deletePlan(plan.trip.id))}><Trash2 size={15} /></IconButton></div>
      </div>)}</div>
      <button className="plan-create" onClick={() => act(p.createPlan)}><Plus size={17} />新建旅行计划</button><p className="plan-switcher-footnote">自动保存计划与上次浏览位置</p>
    </div>}
  </div>;
}
