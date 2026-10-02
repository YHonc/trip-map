'use client';
import { Fragment, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { favoriteDay } from '@/lib/favorites';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Car,
  Star,
  TrainFront,
  Bike,
  Footprints,
  Clock3,
  Calculator,
  LoaderCircle,
  PencilLine,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  MapPin,
  MoreHorizontal,
  Plus,
  Route as RouteIcon,
  Trash2,
} from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { Day, Route, Stop, TravelMode } from '@/lib/types';
import { dayStopOffset, updateRoute } from '@/lib/planner';
import { itineraryLabel, modeLabels, scheduleLabel } from '@/lib/itinerary-format';
import { ScheduleEditor, ScheduleNotes, ScheduleTime } from './schedule-editor';
import { mapProvider } from '@/services/map-service';
import { IconButton, MoreMenu } from './ui';
import { connectedRoutes, setIncomingMode, setStopVisibility } from '@/lib/connected-routes';
import { calculatedTime, departureTime, incomingLeg, stayMinutes } from '@/lib/itinerary-calculation';
import { makeId } from '@/lib/data';
import { GlassSelect } from './glass-select';

export function Sidebar({ dragging }: { dragging: boolean }) {
  const p = usePlanner();
  const routes = p.data.trip.days.flatMap((d) => d.routes);
  const count = routes.reduce((sum, r) => sum + r.stops.length, 0);
  const journeys = p.data.trip.days.flatMap(connectedRoutes).filter(r => r.visible && r.stops.length > 1);
  const results = journeys.map(r => p.routeResults[r.id]);
  const complete = results.every(r => r?.status === 'ready');
  const distance = results.reduce((n, r) => n + (r?.status === 'ready' ? r.geometry?.distance ?? 0 : 0), 0);
  const duration = results.reduce((n, r) => n + (r?.status === 'ready' ? r.geometry?.legs?.reduce((sum, leg) => sum + Math.ceil(leg.duration / 60), 0) ?? Math.ceil((r.geometry?.duration ?? 0) / 60) : 0), 0);
  return (
    <aside className={`sidebar ${dragging ? 'is-dragging' : ''}`} aria-label="行程编辑器">
      <section className="trip-summary glass">
        <div className="summary-heading">
          <h2>行程概览</h2>
          {p.focusedDayId && <button className="text-button" onClick={p.fitAllVisibleRoutes}>查看全部</button>}
          <MoreMenu label="行程选项">
            <button onClick={p.fitAllVisibleRoutes}>在地图中查看全部</button>
            <button onClick={p.toggleAllDays} disabled={!p.data.trip.days.length}>
              {p.allDaysExpanded ? '收起所有天数' : '展开所有天数'}
            </button>
          </MoreMenu>
        </div>
        <div className="summary-stats">
          <div>
            <span className="stat-icon">
              <CalendarDays size={21} />
            </span>
            <span>
              <strong>{p.data.trip.days.length} 天</strong>
              <small>行程天数</small>
            </span>
          </div>
          <div>
            <span className="stat-icon">
              <RouteIcon size={21} />
            </span>
            <span>
              <strong>{journeys.reduce((sum, r) => sum + r.stops.length - 1, 0)} 段</strong>
              <small>地点连线</small>
            </span>
          </div>
          <div>
            <span className="stat-icon">
              <MapPin size={21} />
            </span>
            <span>
              <strong>{count} 个</strong>
              <small>地点总数</small>
            </span>
          </div>
        </div>
        <div className="route-cost-summary">{mapProvider === 'mock' ? '演示估算' : '高德预计'} · {complete ? `${(distance / 1000).toFixed(1)} 公里 · ${duration} 分钟` : '部分路程待计算'}</div>
        {mapProvider === 'amap' && results.some(r => r?.geometry?.calculatedAt) && <div className="route-cost-summary">计算于 {new Date(Math.min(...results.flatMap(r => r?.geometry?.calculatedAt ? [r.geometry.calculatedAt] : []))).toLocaleString()}</div>}
        <div className="itinerary-calculation"><button className="calculate-itinerary" disabled={p.calculating || !count} onClick={() => void p.calculateItinerary()}>{p.calculating ? <LoaderCircle size={15} className="calculation-spinner" /> : <Calculator size={15} />}{p.calculating ? '正在计算…' : '计算行程'}</button><span role="status">{p.calculating ? '更新路程与时间' : p.itineraryDirty && count ? '有调整，待计算' : count ? '预计时间已更新' : '先添加地点'}</span></div>
      </section>
      <div className="day-list" data-testid="day-list">
        {p.data.trip.days.map((day, index) => (
          <DayItem key={day.id} day={day} index={index} dragging={dragging} />
        ))}
      </div>
      <div className="sidebar-footer glass">
        <button className="add-day" onClick={p.addDay}>
          <Plus size={21} />
          添加一天
        </button>
      </div>
    </aside>
  );
}
function DayItem({ day, index, dragging }: { day: Day; index: number; dragging: boolean }) {
  const p = usePlanner();
  const [editing, setEditing] = useState(false);
  const display = itineraryLabel(day);
  const open = p.expandedDays.has(day.id);
  const active = p.selection.activeDayId === day.id;
  const { setNodeRef, isOver } = useDroppable({
    id: `day-drop-${day.id}`,
    data: { type: 'day', dayId: day.id },
  });
  const date = new Date(`${day.date}T12:00:00`);
  const dateText = day.date ? `${date.getMonth() + 1}月${date.getDate()}日 · 周${'日一二三四五六'[date.getDay()]}` : '日期待定';
  const toggle = () => open ? p.toggleDay(day.id) : p.selectDayOnly(day.id);
  const addPlace = () => {
    const route = day.routes.at(-1);
    if (route) p.selectRoute(day.id, route.id, false);
    else p.selectDay(day.id, false);
    p.setSearchFocus(v => v + 1);
  };
  return (
    <section
      ref={setNodeRef}
      className={`day-card ${active ? 'active' : ''} ${isOver ? 'drop-over' : ''}`}
      style={{ '--day-color': day.color } as React.CSSProperties}
      data-testid={day.id}
    >
      <div className="day-header" onClick={event => { if (!(event.target as Element).closest('button, input, label, select, [role="menu"]')) toggle(); }}>
      <div className="day-heading">
        <button className="day-toggle" aria-expanded={open} onClick={toggle}>
          <span className="day-number">{index + 1}</span>
          <span className="day-copy"><strong title={display.name}>{display.name}</strong><span className="day-date">{dateText}</span></span>
          <span className="day-count">
            {day.routes.reduce((sum, r) => sum + r.stops.length, 0)} 个地点
          </span>
        </button>
        <IconButton label={`${open ? '收起' : '展开'}${day.name}`} onClick={toggle}><ChevronDown className={open ? 'rotated' : ''} size={16} /></IconButton>
        <MoreMenu label={`${day.name} 更多操作`}>
          <button onClick={() => p.setDialog({ title: '重命名当天行程', label: '当天名称', initial: display.name, onConfirm: name => p.commit(data => ({ ...data, trip: { ...data.trip, days: data.trip.days.map(d => d.id === day.id ? { ...d, ...display, name } : d) } })) })}><PencilLine size={15} />重命名</button>
          <button onClick={() => setEditing(true)}><CalendarDays size={15} />日期、时间与备注</button>
          <button disabled={index === 0} onClick={() => p.reorderDay(day.id, -1)}>
            <ArrowUp size={15} />
            上移一天
          </button>
          <button
            disabled={index === p.data.trip.days.length - 1}
            onClick={() => p.reorderDay(day.id, 1)}
          >
            <ArrowDown size={15} />
            下移一天
          </button>
          <button onClick={addPlace}>
            <Plus size={15} />
            添加地点
          </button>
          <button disabled={!day.routes.some(route => route.stops.length)} onClick={() => {
            try {
              const next = favoriteDay(p.data, day.id), added = next.favorites.length - p.data.favorites.length;
              if (added) p.commit(current => favoriteDay(current, day.id));
              p.setToast(added ? `已收藏 ${added} 个地点，可撤销` : '当天地点已全部收藏');
            } catch (error) { p.setToast(error instanceof Error ? error.message : '收藏失败'); }
          }}><Star size={15} />收藏当天全部地点</button>
          <button
            className="danger"
            onClick={() =>
              p.setDialog({
                title: `删除 ${day.name}？`,
                description: '当天的路线和地点将一并移除，你可以通过撤销恢复。',
                destructive: true,
                onConfirm: () =>
                  p.commit((data) => ({
                    ...data,
                    trip: { ...data.trip, days: data.trip.days.filter((d) => d.id !== day.id) },
                  })),
              })
            }
          >
            <Trash2 size={15} />
            删除这一天
          </button>
        </MoreMenu>
      </div>
      <div className="day-city-row"><button className="city-badge day-city" aria-label={`设置 ${day.name} 城市`} onClick={() => p.setCityTarget({ dayId: day.id })}><MapPin className="day-city-icon" size={12} /><span>{day.city?.name ?? '设置当天城市'}</span><ChevronDown size={12} /></button>
        {dragging && <div className="day-drop-hint">拖到这里加入 {day.name}</div>}
      </div>
      <label className="day-departure"><Clock3 size={12} /><span>当天出发</span><input aria-label={`${day.name}出发时间`} type="time" value={departureTime(day)} onChange={event => { const value = event.target.value; if (value) p.commit(current => ({ ...current, trip: { ...current.trip, days: current.trip.days.map(d => d.id === day.id ? { ...d, departureTime: value } : d) } })); }} /></label>
      </div>
      {open && (
        <div className="day-content">
          <ScheduleTime value={display} />
          <ScheduleNotes notes={display.notes} />
          {day.routes.length ? (
            day.routes.map((route, routeIndex) => (
              <Fragment key={route.id}>
              <RouteItem
                day={day}
                route={route}
                index={routeIndex}
                dragging={dragging}
              />
              </Fragment>
            ))
          ) : (
            <div className="empty-day">
              <MapPin size={23} />
              <strong>还没有安排地点</strong>
              <span>在右侧搜索地点，或从收藏地址拖入</span>
              <button onClick={() => p.setSearchFocus((v) => v + 1)}>搜索想去的地方</button>
            </div>
          )}
          <button className="text-button add-route timeline-add" onClick={addPlace}>
            <Plus size={14} />
            添加地点
          </button>
        </div>
      )}
      {editing && <ScheduleEditor title="当天安排" value={display} onClose={() => setEditing(false)} onSave={value => p.commit(data => ({ ...data, trip: { ...data.trip, days: data.trip.days.map(d => d.id === day.id ? { ...d, ...value, name: value.name!, date: value.date! } : d) } }))} />}
    </section>
  );
}
function RouteItem({ day, route, dragging }: { day: Day; route: Route; index: number; dragging: boolean }) {
  const p = usePlanner();
  const sortableStopIds = useMemo(() => route.stops.map(stop => stop.id), [route.stops]);
  const result = p.routeResults[route.id];
  const journey = connectedRoutes(day).find(r => r.id === route.id)!;
  const hasIncoming = journey.stops.length > route.stops.length;
  const { setNodeRef, isOver } = useDroppable({
    id: `route-drop-${route.id}`, data: { type: 'route', dayId: day.id, routeId: route.id },
  });
  return <section ref={setNodeRef} className={`timeline-route ${isOver ? 'drop-over' : ''} ${!route.visible ? 'route-hidden' : ''}`} data-testid={route.id}>
    <SortableContext items={sortableStopIds} strategy={verticalListSortingStrategy}>
      {route.stops.map((stop, index) => <Fragment key={stop.id}>
        {(hasIncoming || index > 0) && <div className="timeline-connection">
          <span className="timeline-rail" aria-hidden="true"><ArrowDown size={12} /></span>
          <ModeIcon mode={route.mode} />
          <GlassSelect label={`前往${stop.name}的交通方式`} value={route.mode} options={(['walking', 'driving', 'riding', 'subway'] as TravelMode[]).map(mode => ({ value: mode, label: modeLabels[mode] }))} onChange={mode => {
            const ids: [string, string] = [makeId('route'), makeId('route')];
            p.commit(current => ({ ...current, trip: { ...current.trip, days: current.trip.days.map(d => d.id === day.id ? setIncomingMode(d, route.id, stop.id, mode as TravelMode, ids) : d) } }));
          }} />
          {(() => { const leg = incomingLeg(journey, result, stop.id); return <span className="timeline-distance">{leg ? `${Math.ceil(leg.duration / 60)} 分钟 · ${(leg.distance / 1000).toFixed(1)} km` : route.visible ? '待计算' : '已隐藏'}</span>; })()}
        </div>}
        <InsertionTarget day={day} route={route} index={index} dragging={dragging} />
        <StopItem day={day} route={route} stop={stop} index={index} />
      </Fragment>)}
      <InsertionTarget day={day} route={route} index={route.stops.length} dragging={dragging} />
    </SortableContext>
    {result?.status === 'loading' && journey.stops.length > 1 && <span className="route-updating"><i />正在连接地点…</span>}
    {result?.status === 'error' && <div className="route-error">{result.error ?? '无法连接地点'} <button disabled={p.calculating} onClick={() => p.recalculateRoute(route.id)}>重试</button></div>}
  </section>;
}
function InsertionTarget({
  day,
  route,
  index,
  dragging,
}: {
  day: Day;
  route: Route;
  index: number;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `insert-${route.id}-${index}`,
    data: { type: 'insertion', dayId: day.id, routeId: route.id, index },
  });
  return (
    <div
      ref={setNodeRef}
      data-testid={`insert-${route.id}-${index}`}
      className={`insertion-target ${dragging ? 'enabled' : ''} ${isOver ? 'over' : ''}`}
    >
      <span />
    </div>
  );
}
function StopItem({
  day,
  route,
  stop,
  index,
}: {
  day: Day;
  route: Route;
  stop: Stop;
  index: number;
}) {
  const p = usePlanner();
  const [editing, setEditing] = useState(false);
  const visit = p.visits[stop.id];
  const toggleVisibility = () => {
    const ids: [string, string] = [makeId('route'), makeId('route')];
    p.commit(current => ({ ...current, trip: { ...current.trip, days: current.trip.days.map(d => d.id === day.id ? setStopVisibility(d, route.id, stop.id, !route.visible, ids) : d) } }));
    if (route.visible && p.selectedPlace?.id === stop.id) p.setSelectedPlace(null);
  };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
    data: { type: 'stop', place: stop, dayId: day.id, routeId: route.id, index },
    transition: { duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  });
  return (
    <div
      ref={setNodeRef}
      className={`stop-card ${p.selection.activeStopId === stop.id ? 'selected' : ''} ${isDragging ? 'drag-source' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid={`stop-${stop.id}`}
      onPointerDown={event => { if (!(event.target as Element).closest('.more-menu, .modal-backdrop, .stop-visibility')) listeners?.onPointerDown?.(event); }}
      onClick={event => { if (!(event.target as Element).closest('.more-menu, .modal-backdrop, .stop-visibility') && !isDragging) p.openPlace(stop, 'planned', day.id, route.id); }}
    >
      <button
        className="drag-handle"
        aria-label={`拖动${stop.name}`}
        {...attributes}
        onKeyDown={event => listeners?.onKeyDown?.(event)}
      >
        <GripVertical size={17} />
      </button>
      <div className="stop-index-column">
        <span className="stop-number" style={{ background: day.color }}>
          {dayStopOffset(day, route.id) + index + 1}
        </span>
        <button className="stop-visibility" aria-label={`${route.visible ? '隐藏' : '显示'}${stop.name}`} aria-pressed={route.visible} title={route.visible ? '隐藏此地点' : '显示此地点'} onClick={toggleVisibility}>{route.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
      </div>
      <button className="stop-main" aria-label={`${dayStopOffset(day, route.id) + index + 1} ${stop.name} ${stop.address}`}>
        <span className="stop-text">
          <strong title={stop.name}>{stop.name}</strong>
          {visit ? <small className="stop-visit-time" title={scheduleLabel(stop) ? `原安排 ${scheduleLabel(stop)}` : undefined}>预计 {calculatedTime(visit.arrival)}–{calculatedTime(visit.departure)}</small> : scheduleLabel(stop) && <small className="stop-visit-time">原安排 {scheduleLabel(stop)}</small>}
          <small className="stop-stay">停留 {stayMinutes(stop)} 分钟{!route.visible ? ' · 已隐藏' : ''}</small>
          <small title={stop.address}>{stop.address}</small>
          {stop.notes && <small title={stop.notes}>备注 · {stop.notes}</small>}
        </span>
      </button>
      <MoreMenu label={`${stop.name}操作`}>
        <button onClick={() => setEditing(true)}><Clock3 size={15} />停留时间与备注</button>
        <button onClick={toggleVisibility}>{route.visible ? <EyeOff size={15} /> : <Eye size={15} />}{route.visible ? '隐藏此地点' : '显示此地点'}</button>
        <button className="danger" onClick={() => p.removeStop(route.id, stop.id)}>
          <Trash2 size={15} />
          删除地点
        </button>
      </MoreMenu>
      {editing && <ScheduleEditor title={`${stop.name} · 停留安排`} value={{ stayMinutes: stayMinutes(stop), startTime: stop.startTime, endTime: stop.endTime, endDayOffset: stop.endDayOffset, notes: stop.notes }} onClose={() => setEditing(false)} onSave={value => p.commit(current => updateRoute(current, route.id, r => ({ ...r, stops: r.stops.map(s => s.id === stop.id ? { ...s, stayMinutes: value.stayMinutes, startTime: value.startTime, endTime: value.endTime, endDayOffset: value.endDayOffset, notes: value.notes } : s) })))} />}
    </div>
  );
}

function ModeIcon({ mode }: { mode: TravelMode }) {
  const Icon = mode === 'walking' ? Footprints : mode === 'riding' ? Bike : mode === 'subway' ? TrainFront : Car;
  return <Icon size={13} />;
}

export function StopCardPreview({ stop, number, color, style }: { stop: Stop; number: number; color: string; style?: React.CSSProperties }) {
  return <div className="stop-card stop-drag-preview" style={style} aria-hidden="true">
    <span className="drag-handle"><GripVertical size={17} /></span>
    <span className="stop-main"><span className="stop-number" style={{ background: color }}>{number}</span><span className="stop-text"><strong>{stop.name}</strong><small>{stop.address.replace('上海市', '')}</small></span></span>
    <span className="stop-preview-more"><MoreHorizontal size={18} /></span>
  </div>;
}
