'use client';
import { Map, LoaderCircle } from 'lucide-react';

export function LoadingPanel({ title = '正在打开你的旅程', detail, completed = 0, total = 3, error, onRetry, compact = false }: {
  title?: string; detail: string; completed?: number; total?: number; error?: string; onRetry?: () => void; compact?: boolean;
}) {
  return <div className={`loading-panel ${compact ? 'compact' : ''}`} role={error ? 'alert' : 'status'}>
    <div className="loading-map-icon"><Map size={compact ? 22 : 32} strokeWidth={1.6} /></div>
    <div className="loading-copy"><h2>{error ? '暂时无法打开' : title}</h2><p>{error || detail}</p></div>
    {!error && <><div className="loading-progress" role="progressbar" aria-label={detail} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed} aria-valuetext={`${completed} / ${total} 个阶段已完成`}><span style={{ width: `${completed / total * 100}%` }} /><i /></div>
      <div className="loading-caption"><LoaderCircle size={13} /><span>{detail}</span><span>{completed} / {total}</span></div></>}
    {error && onRetry && <button className="primary-button" onClick={onRetry}>重新加载</button>}
    {!compact && !error && <div className="loading-steps"><span>本机计划</span><span>地图配置</span><span>恢复浏览位置</span></div>}
  </div>;
}
