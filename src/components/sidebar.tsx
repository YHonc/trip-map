'use client';
import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Car,
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
import { dayStopOffset } from '@/lib/planner';
import { dayConnections } from '@/lib/connections';
import { mapProvider } from '@/services/map-service';
import { IconButton, MoreMenu } from './ui';
import { GlassSelect } from './glass-select';

export function Sidebar({ dragging }: { dragging: boolean }) {
  const p = usePlanner();
  const routes = p.data.trip.days.flatMap((d) => d.routes);
  const count = routes.reduce((sum, r) => sum + r.stops.length, 0);
  const results = [...routes.filter(r => r.stops.length > 1).map(r => p.routeResults[r.id]), ...p.data.trip.days.flatMap(dayConnections).filter(c => c.enabled).map(c => p.transferResults[c.id])];
  const complete = results.every(r => r?.status === 'ready');
  const distance = results.reduce((n, r) => n + (r?.status === 'ready' ? r.geometry?.distance ?? 0 : 0), 0);
  const duration = results.reduce((n, r) => n + (r?.status === 'ready' ? r.geometry?.duration ?? 0 : 0), 0);
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
              <strong>{routes.length} 条</strong>
              <small>路线数量</small>
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
        <div className="route-cost-summary">{mapProvider === 'mock' ? '演示估算' : '高德预计'} · {complete ? `${(distance / 1000).toFixed(1)} 公里 · ${Math.round(duration / 60)} 分钟` : '部分路程待计算'}（含已启用转场）</div>
        {mapProvider === 'amap' && results.some(r => r?.geometry?.calculatedAt) && <div className="route-cost-summary">结果最早计算于 {new Date(Math.min(...results.flatMap(r => r?.geometry?.calculatedAt ? [r.geometry.calculatedAt] : []))).toLocaleString()} · 非实时路况</div>}
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
  const open = p.expandedDays.has(day.id);
  const active = p.selection.activeDayId === day.id;
  const { setNodeRef, isOver } = useDroppable({
    id: `day-drop-${day.id}`,
    data: { type: 'day', dayId: day.id },
  });
  const date = new Date(`${day.date}T12:00:00`);
  const dateText = `${date.getMonth() + 1}月${date.getDate()}日 · 周${'日一二三四五六'[date.getDay()]}`;
  const toggle = () => open ? p.toggleDay(day.id) : p.selectDayOnly(day.id);
  return (
    <section
      ref={setNodeRef}
      className={`day-card ${active ? 'active' : ''} ${isOver ? 'drop-over' : ''}`}
      style={{ '--day-color': day.color } as React.CSSProperties}
      data-testid={day.id}
    >
      <div className="day-header" onClick={event => { if (!(event.target as Element).closest('button, input, select, [role="menu"]')) toggle(); }}>
      <div className="day-heading">
        <button className="day-toggle" aria-expanded={open} onClick={toggle}>
          <span className="day-number">{index + 1}</span>
          <span className="day-copy"><strong>{day.name}</strong><span className="day-date">{dateText}</span></span>
          <span className="day-count">
            {day.routes.reduce((sum, r) => sum + r.stops.length, 0)} 个地点
          </span>
        </button>
        <IconButton label={`${open ? '收起' : '展开'}${day.name}`} onClick={toggle}><ChevronDown className={open ? 'rotated' : ''} size={16} /></IconButton>
        <MoreMenu label={`${day.name} 更多操作`}>
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
          <button onClick={() => p.addRoute(day)}>
            <Plus size={15} />
            添加路线
          </button>
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
      </div>
      {open && (
        <div className="day-content">
          {day.routes.length ? (
            day.routes.map((route, routeIndex) => (
              <RouteItem
                key={route.id}
                day={day}
                route={route}
                index={routeIndex}
                dragging={dragging}
              />
            ))
          ) : (
            <div className="empty-day">
              <MapPin size={23} />
              <strong>还没有安排地点</strong>
              <span>在右侧搜索地点，或从收藏地址拖入</span>
              <button onClick={() => p.setSearchFocus((v) => v + 1)}>搜索想去的地方</button>
            </div>
          )}
          {dayConnections(day).map(connection => <div className="transfer-setting" key={connection.id}>
            <label><input type="checkbox" checked={connection.enabled} onChange={e => p.editTransfer(day.id, connection.from.id, connection.to.id, e.target.checked, connection.mode)} /> 转场：{connection.from.name} → {connection.to.name}</label>
            <GlassSelect label={`转场 ${connection.from.name} 到 ${connection.to.name} 交通方式`} value={connection.mode} onChange={value => p.editTransfer(day.id, connection.from.id, connection.to.id, connection.enabled, value as TravelMode)} options={[{value:'driving',label:'驾车'},{value:'walking',label:'步行'},{value:'riding',label:'骑行'}]} />
            {connection.enabled && p.transferResults[connection.id]?.status === 'error' && <button onClick={p.retryTransfers}>{p.transferResults[connection.id].error} · 重试</button>}
          </div>)}
          <button className="text-button add-route" onClick={() => p.addRoute(day)}>
            <Plus size={14} />
            添加路线
          </button>
        </div>
      )}
    </section>
  );
}
function RouteItem({
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
  const p = usePlanner();
  const open = p.expandedRoutes.has(route.id);
  const sortableStopIds = useMemo(() => route.stops.map(stop => stop.id), [route.stops]);
  const result = p.routeResults[route.id];
  const toggle = () => open ? p.toggleRoute(route.id) : p.selectRouteOnly(day.id, route.id);
  const { setNodeRef, isOver } = useDroppable({
    id: `route-drop-${route.id}`,
    data: { type: 'route', dayId: day.id, routeId: route.id },
  });
  return (
    <section
      ref={setNodeRef}
      className={`route-card ${p.selection.activeRouteId === route.id ? 'active-route' : ''} ${isOver ? 'drop-over' : ''} ${!route.visible ? 'route-hidden' : ''}`}
      data-testid={route.id}
    >
      <div className="route-header" onClick={event => { if (!(event.target as Element).closest('button, input, select, [role="menu"]')) toggle(); }}>
      <div className="route-heading">
        <button
          className="route-toggle"
          aria-expanded={open}
          onClick={toggle}
        >
          <span className="route-dot" style={{ background: route.color }} />
          <strong>{route.name}</strong>
        </button>
        <span className="route-count">{route.stops.length} 个地点</span>
        <div className="route-actions">
          <IconButton
            label={`${route.visible ? '隐藏' : '显示'}${route.name}`}
            onClick={() => p.editRoute(route.id, { visible: !route.visible })}
          >
            {route.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </IconButton>
          <MoreMenu label={`${route.name}设置`}>
            <label className="menu-label">交通方式</label>
            {(['driving', 'walking', 'riding'] as TravelMode[]).map((mode, i) => (
              <button
                key={mode}
                className={route.mode === mode ? 'selected' : ''}
                onClick={() => p.editRoute(route.id, { mode })}
              >
                <Car size={15} />
                {['驾车', '步行', '骑行'][i]}
                {route.mode === mode && <span className="menu-check">✓</span>}
              </button>
            ))}
            <hr />
            <button
              onClick={() =>
                p.setDialog({
                  title: '重命名路线',
                  label: '路线名称',
                  initial: route.name,
                  onConfirm: (name) => p.editRoute(route.id, { name }),
                })
              }
            >
              重命名
            </button>
            <button disabled={index === 0} onClick={() => p.reorderRoute(day.id, route.id, -1)}>
              上移路线
            </button>
            <button
              disabled={index === day.routes.length - 1}
              onClick={() => p.reorderRoute(day.id, route.id, 1)}
            >
              下移路线
            </button>
            <button
              className="danger"
              onClick={() =>
                p.setDialog({
                  title: `删除${route.name}？`,
                  description: '路线中的地点会一并移除，可以撤销。',
                  destructive: true,
                  onConfirm: () =>
                    p.commit((data) => ({
                      ...data,
                      trip: {
                        ...data.trip,
                        days: data.trip.days.map((d) =>
                          d.id === day.id
                            ? { ...d, routes: d.routes.filter((r) => r.id !== route.id) }
                            : d,
                        ),
                      },
                    })),
                })
              }
            >
              删除路线
            </button>
          </MoreMenu>
        </div>
        <IconButton
          label={`${open ? '收起' : '展开'}${route.name}`}
          onClick={toggle}
        >
          <ChevronDown className={open ? 'rotated' : ''} size={15} />
        </IconButton>
      </div>
      <button className="city-badge route-city" aria-label={`设置 ${route.name} 城市`} onClick={() => p.setCityTarget({ dayId: day.id, routeId: route.id })}><MapPin size={11} />{route.city?.name ?? (day.city ? `继承 ${day.city.name}` : '跟随当天城市')}<ChevronDown size={11} /></button>
      </div>
      {open && (
        <div className="stop-list">
          <SortableContext
            items={sortableStopIds}
            strategy={verticalListSortingStrategy}
          >
            {route.stops.map((stop, stopIndex) => (
              <div key={stop.id}>
                <InsertionTarget day={day} route={route} index={stopIndex} dragging={dragging} />
                <StopItem day={day} route={route} stop={stop} index={stopIndex} />
              </div>
            ))}
            <InsertionTarget
              day={day}
              route={route}
              index={route.stops.length}
              dragging={dragging}
            />
          </SortableContext>
          {route.stops.length < 2 && (
            <p className="route-empty">
              {route.stops.length ? '再添加 1 个地点即可生成路线' : '从收藏地址拖入，开始这段旅程'}
            </p>
          )}
          {result?.status === 'loading' && (
            <span className="route-updating">
              <i />
              正在更新路线…
            </span>
          )}
          {result?.status === 'error' && (
            <div className="route-error">
              {result.error ?? '无法规划此路线'} <button onClick={() => p.recalculateRoute(route.id)}>重新计算</button>
            </div>
          )}
          <button
            className="text-button add-stop"
            onClick={() => {
              p.selectRoute(day.id, route.id, false);
              p.setSearchFocus((v) => v + 1);
            }}
          >
            <Plus size={13} />
            添加地点
          </button>
        </div>
      )}
    </section>
  );
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
      onPointerDown={event => { if (!(event.target as Element).closest('.more-menu')) listeners?.onPointerDown?.(event); }}
      onClick={event => { if (!(event.target as Element).closest('.more-menu') && !isDragging) p.openPlace(stop, 'planned', day.id, route.id); }}
    >
      <button
        className="drag-handle"
        aria-label={`拖动${stop.name}`}
        {...attributes}
        onKeyDown={event => listeners?.onKeyDown?.(event)}
      >
        <GripVertical size={17} />
      </button>
      <button className="stop-main">
        <span className="stop-number" style={{ background: day.color }}>
          {dayStopOffset(day, route.id) + index + 1}
        </span>
        <span className="stop-text">
          <strong>{stop.name}</strong>
          <small>{stop.address.replace('上海市', '')}</small>
        </span>
      </button>
      <MoreMenu label={`${stop.name}操作`}>
        <button className="danger" onClick={() => p.removeStop(route.id, stop.id)}>
          <Trash2 size={15} />
          删除地点
        </button>
      </MoreMenu>
    </div>
  );
}

export function StopCardPreview({ stop, number, color, style }: { stop: Stop; number: number; color: string; style?: React.CSSProperties }) {
  return <div className="stop-card stop-drag-preview" style={style} aria-hidden="true">
    <span className="drag-handle"><GripVertical size={17} /></span>
    <span className="stop-main"><span className="stop-number" style={{ background: color }}>{number}</span><span className="stop-text"><strong>{stop.name}</strong><small>{stop.address.replace('上海市', '')}</small></span></span>
    <span className="stop-preview-more"><MoreHorizontal size={18} /></span>
  </div>;
}
