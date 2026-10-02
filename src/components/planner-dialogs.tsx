'use client';
import { GlassSelect } from './glass-select';
import { useState } from 'react';
import { Map, Plus } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { Modal } from './ui';
import { StayDuration } from './stay-duration';
export function PlannerDialogs() {
  const p = usePlanner();
  return (
    <>
      {p.dialog && <EditDialog />}
      {p.destination && <DestinationDialog />}
    </>
  );
}
function EditDialog() {
  const p = usePlanner();
  const dialog = p.dialog!;
  const [value, setValue] = useState(dialog.initial ?? '');
  return (
    <Modal title={dialog.title} onClose={() => p.setDialog(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (dialog.label && !value.trim()) return;
          dialog.onConfirm(value.trim());
          p.setDialog(null);
        }}
      >
        {dialog.description && <p className="modal-description">{dialog.description}</p>}
        {dialog.label && (
          <label className="form-label">
            {dialog.label}
            <input
              autoFocus
              maxLength={40}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={dialog.label}
            />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => p.setDialog(null)}>
            取消
          </button>
          <button
            type="submit"
            className={dialog.destructive ? 'danger-button' : 'primary-button'}
            disabled={!!dialog.label && !value.trim()}
          >
            {dialog.destructive ? '确认删除' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function DestinationDialog() {
  const p = usePlanner();
  const destination = p.destination!;
  const [dayId, setDayId] = useState(
    destination.dayId ?? p.selection.activeDayId ?? p.data.trip.days[0]?.id ?? '',
  );
  const day = p.data.trip.days.find((d) => d.id === dayId);
  const [stay, setStay] = useState(30);
  return (
    <Modal title="加入行程" onClose={() => p.setDestination(null)}>
      <p className="destination-place">
        <Map size={18} />
        把「{destination.drag.place.name}」放进旅程
      </p>
      <label className="form-label">
        选择日期
        <GlassSelect label="选择日期" value={dayId} onChange={setDayId} options={p.data.trip.days.map(d => ({ value: d.id, label: d.name, detail: d.date }))} />
      </label>
      {destination.drag.type === 'favorite' && <StayDuration value={stay} onChange={setStay} />}
      {day ? (
        <button
          className="create-route-button"
          disabled={!Number.isInteger(stay) || stay < 0 || stay > 1440}
          onClick={() => p.dropOnDay(destination.drag, day.id, stay)}
        >
          <Plus size={17} />
          加入当天行程
        </button>
      ) : (
        <div className="empty-day">
          <span>先添加一天，再放入想去的地点</span>
          <button
            onClick={() => {
              p.addDay();
              p.setDestination(null);
            }}
          >
            添加一天
          </button>
        </div>
      )}
    </Modal>
  );
}
