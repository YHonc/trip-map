'use client';
import { Check, Map, PencilLine, Redo2, ArrowUpDown, Undo2 } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { IconButton } from './ui';
import { GlassSelect } from './glass-select';
import { DebugPanel } from './debug-panel';
export function TripHeader({ onTransfer, onAI, onSettings }: { onTransfer: () => void; onAI: () => void; onSettings: () => void }) {
  const p = usePlanner();
  return (
    <header className="trip-header">
      <div className="brand-icon">
        <Map size={27} strokeWidth={1.8} />
      </div>
      <div className="plan-switcher"><GlassSelect label="切换旅行计划" value={p.data.trip.id} onChange={value => value === '__new_plan__' ? p.createPlan() : p.switchPlan(value)} options={[...p.plans.map(plan => ({ value: plan.trip.id, label: plan.trip.name, detail: `${plan.trip.days.length} 天 · ${plan.trip.days.flatMap(day => day.routes).reduce((sum, route) => sum + route.stops.length, 0)} 个地点` })), { value: '__new_plan__', label: '＋ 新建旅行计划', detail: '当前计划会自动保存' }]} /></div>
      <IconButton
        label="编辑行程名称"
        onClick={() =>
          p.setDialog({
            title: '给旅程起个名字',
            label: '行程名称',
            initial: p.data.trip.name,
            onConfirm: (name) => p.commit((data) => ({ ...data, trip: { ...data.trip, name } })),
          })
        }
      >
        <PencilLine size={17} />
      </IconButton>
      <div className="header-spacer" />
      <DebugPanel />
      <button className="share-button" onClick={onSettings}>地图设置</button>
      <button className="share-button" onClick={onAI}>AI 路线助手</button>
      <div className="history-buttons">
        <IconButton label="撤销" disabled={!p.canUndo} onClick={p.undo}>
          <Undo2 size={19} />
        </IconButton>
        <IconButton label="重做" disabled={!p.canRedo} onClick={p.redo}>
          <Redo2 size={19} />
        </IconButton>
      </div>
      <div className="save-status" role="status">
        <span className="saved-check">
          <Check size={12} strokeWidth={3} />
        </span>
        {p.saveStatus}
      </div>
      <button className="share-button" aria-label="导入 / 导出" onClick={onTransfer}>
        <ArrowUpDown size={18} />
        <span>导入 / 导出</span>
      </button>
    </header>
  );
}
