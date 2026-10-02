'use client';
import { STAY_OPTIONS } from '@/lib/itinerary-calculation';

export function StayDuration({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  return <fieldset className="stay-duration"><legend>停留时间</legend>
    <div className="stay-options" role="group" aria-label="停留时间快捷选项">{STAY_OPTIONS.map(minutes => <button key={minutes} type="button" aria-pressed={value === minutes} onClick={() => onChange(minutes)}>{minutes}<span>分钟</span></button>)}</div>
    <label className="stay-custom">自定义<input aria-label="自定义停留分钟" type="number" min={0} max={1440} step={1} required value={value} onChange={event => onChange(Number(event.target.value))} /><span>分钟</span></label>
  </fieldset>;
}
