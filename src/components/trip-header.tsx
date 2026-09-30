'use client';
import { Check, Map, Redo2, ArrowUpDown, Undo2 } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { IconButton } from './ui';
import { PlanSwitcher } from './plan-switcher';
import { DebugPanel } from './debug-panel';
export function TripHeader({ onTransfer, onAI, onSettings }: { onTransfer: () => void; onAI: () => void; onSettings: () => void }) {
  const p = usePlanner();
  return (
    <header className="trip-header">
      <div className="brand-icon">
        <Map size={27} strokeWidth={1.8} />
      </div>
      <PlanSwitcher />
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
