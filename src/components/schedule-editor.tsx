'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, NotebookPen } from 'lucide-react';
import type { Schedule, TravelMode } from '@/lib/types';
import { modeLabels, readSchedule, scheduleLabel } from '@/lib/itinerary-format';
import { Modal } from './ui';
import { StayDuration } from './stay-duration';

type ScheduleValue = Schedule & { name?: string; date?: string; mode?: TravelMode; stayMinutes?: number };
export function ScheduleEditor({ title, value, onSave, onClose }: { title: string; value: ScheduleValue; onSave: (value: ScheduleValue) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ScheduleValue>(() => ({ ...value }));
  const [error, setError] = useState('');
  const field = (patch: Partial<ScheduleValue>) => { setDraft(v => ({ ...v, ...patch })); setError(''); };
  return createPortal(<Modal title={title} onClose={onClose} className="schedule-modal">
    <form className="schedule-form" onSubmit={event => {
      event.preventDefault();
      try {
        const form = new FormData(event.currentTarget);
        const submitted = { ...draft, ...Object.fromEntries(form), endDayOffset: form.has('nextDay') ? 1 as const : 0 as const } as ScheduleValue;
        const schedule = readSchedule(submitted as Record<string, unknown>, '安排');
        if (draft.stayMinutes !== undefined && (!Number.isInteger(draft.stayMinutes) || draft.stayMinutes < 0 || draft.stayMinutes > 1440)) throw new Error('停留时间须为 0–1440 分钟的整数');
        if (submitted.name !== undefined && (!submitted.name.trim() || submitted.name.length > 120)) throw new Error('名称须为 1–120 字符');
        if (submitted.date && (!/^\d{4}-\d{2}-\d{2}$/.test(submitted.date) || new Date(`${submitted.date}T12:00:00Z`).toISOString().slice(0, 10) !== submitted.date)) throw new Error('请填写有效日期');
        onSave({ ...(submitted.name !== undefined ? { name: submitted.name.trim() } : {}), ...(submitted.date !== undefined ? { date: submitted.date } : {}), ...(submitted.mode ? { mode: submitted.mode } : {}), ...(draft.stayMinutes !== undefined ? { stayMinutes: draft.stayMinutes } : {}), startTime: undefined, endTime: undefined, endDayOffset: undefined, notes: undefined, ...schedule }); onClose();
      } catch (e) { setError(e instanceof Error ? e.message : '请检查安排'); }
    }}>
      {draft.name !== undefined && <label>名称<input name="name" value={draft.name} maxLength={120} required onChange={e => field({ name: e.target.value })} /><small>用简短标题概括这一段，详细安排放在备注。</small></label>}
      {draft.date !== undefined && <label>日期<input name="date" type="date" value={draft.date} onChange={e => field({ date: e.target.value })} /><small>留空表示日期待定。</small></label>}
      {draft.stayMinutes !== undefined && <StayDuration value={draft.stayMinutes} onChange={stayMinutes => field({ stayMinutes })} />}
      <div className="schedule-time-fields">
        <label>开始时间<input name="startTime" type="time" value={draft.startTime || ''} onInput={e => field({ startTime: e.currentTarget.value })} onChange={e => field({ startTime: e.target.value })} /></label>
        <label>结束时间<input name="endTime" type="time" value={draft.endTime || ''} onInput={e => field({ endTime: e.currentTarget.value })} onChange={e => field({ endTime: e.target.value })} /></label>
      </div>
      <label className="schedule-next-day"><input name="nextDay" type="checkbox" checked={draft.endDayOffset === 1} onChange={e => field({ endDayOffset: e.target.checked ? 1 : 0 })} />次日结束</label>
      {draft.mode && <label>出行方式<select name="mode" value={draft.mode} onChange={e => field({ mode: e.target.value as TravelMode })}>{Object.entries(modeLabels).map(([mode, name]) => <option key={mode} value={mode}>{name}</option>)}</select></label>}
      <label>备注<textarea name="notes" rows={4} value={draft.notes || ''} maxLength={2000} placeholder="停留安排、候车缓冲、预订或待确认事项…" onChange={e => field({ notes: e.target.value })} /></label>
      <p className="schedule-help"><Clock3 size={14} />手填时间保留为原安排；点击「计算行程」后更新预计到达时间。</p>
      {error && <p className="transfer-error" role="alert">{error}</p>}
      <div className="schedule-footer"><button type="button" className="text-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存安排</button></div>
    </form>
  </Modal>, document.body);
}
export function ScheduleNotes({ notes }: { notes?: string }) {
  if (!notes) return null;
  return <details className="schedule-notes"><summary><NotebookPen size={12} /><span>备注 · {notes.replace(/\s+/g, ' ').slice(0, 35)}{notes.length > 35 ? '…' : ''}</span></summary><p>{notes}</p></details>;
}
export function ScheduleTime({ value }: { value: Schedule }) {
  const label = scheduleLabel(value);
  return label ? <span className="schedule-time"><Clock3 size={12} />{label}</span> : null;
}
