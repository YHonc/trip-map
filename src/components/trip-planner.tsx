'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Check, GripVertical, MapPin } from 'lucide-react';
import { PlannerProvider, usePlanner } from '@/hooks/use-planner';
import { DragData, DropData } from '@/lib/types';
import { TripHeader } from './trip-header';
import { Sidebar, StopCardPreview } from './sidebar';
import { dayStopOffset } from '@/lib/planner';
import { PlaceSearch } from './place-search';
import { FavoriteDrawer } from './favorite-drawer';
import { PlannerDialogs } from './planner-dialogs';
import { configureMap } from '@/services/map-service';
import type { PublicMapConfig } from '@/lib/map-config';
import { readLibrary, type SavedLibrary } from '@/services/plan-storage';
import { loadAMap } from '@/services/amap-sdk';
import { LoadingPanel } from './loading-panel';
const MapView = dynamic(() => import('./map/map-view').then(module => module.MapView), { loading: () => <div className="map-loading-overlay"><LoadingPanel compact title="正在准备地图" detail="加载地图视图" completed={0} total={2} /></div> });
const TransferDialog = dynamic(() => import('./transfer-dialog').then(module => module.TransferDialog));
const AIDialog = dynamic(() => import('./ai-dialog').then(module => module.AIDialog));
const CityDialog = dynamic(() => import('./city-dialog').then(module => module.CityDialog));
const PoiRepairDialog = dynamic(() => import('./poi-repair-dialog').then(module => module.PoiRepairDialog));
const MapSettings = dynamic(() => import('./map-settings').then(module => module.MapSettings));
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (!hits.length) return args.pointerCoordinates ? [] : closestCenter(args);
  const drag = args.active.data.current as DragData | undefined;
  // Keep a sortable target while crossing gaps; insertion targets have no sortable index.
  if (drag?.type === 'stop' && hits.some(hit => {
    const target = args.droppableContainers.find(container => container.id === hit.id)?.data.current as DropData | undefined;
    return (target?.type === 'stop' || target?.type === 'insertion') && target.routeId === drag.routeId;
  })) {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => {
      const target = container.data.current as DropData | undefined;
      return target?.type === 'stop' && target.routeId === drag.routeId;
    }) });
  }
  const priority: Record<string, number> = { insertion: 0, stop: 1, route: 2, day: 3 };
  return hits.sort(
    (a, b) =>
      (priority[String(a.data?.droppableContainer.data.current?.type)] ?? 10) -
      (priority[String(b.data?.droppableContainer.data.current?.type)] ?? 10),
  );
};
export function TripPlannerPage() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(0);
  const initialLibrary = useRef<Promise<SavedLibrary> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    initialLibrary.current ??= readLibrary();
    void initialLibrary.current.then(() => { if (active) setCompleted(1); }).catch(() => {});
    void fetch('/api/amap/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) }).then(async response => { const config = await response.json(); if (!response.ok) throw new Error(config.error); return config as PublicMapConfig; }).then(config => { if (active) { configureMap(config); if (config.provider === 'amap') void loadAMap().catch(() => {}); setLoaded(true); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  if (!loaded) return <main className="startup-screen"><LoadingPanel detail={completed ? '正在准备地图配置' : '正在读取本机计划与地图配置'} completed={completed} error={error} onRetry={() => location.reload()} /></main>;
  return (
    <PlannerProvider initialLibrary={initialLibrary.current}>
      <PlannerWorkspace />
    </PlannerProvider>
  );
}
function PlannerWorkspace() {
  const p = usePlanner();
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [dragStyle, setDragStyle] = useState<CSSProperties>({});
  const [drawerHeight, setDrawerHeight] = useState(148);
  const [transferOpen, setTransferOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
      bypassActivationConstraint: ({ event }) => event.target instanceof Element && !!event.target.closest('.drag-handle'),
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useEffect(() => {
    document.body.classList.toggle('is-grabbing', !!dragging);
    return () => document.body.classList.remove('is-grabbing');
  }, [dragging]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (p.planBusy) return;
      if ((e.target as HTMLElement).matches('input,textarea,select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) p.redo();
        else p.undo();
      }
      if (e.key === 'Escape') {
        p.setSelectedPlace(null);
        if (!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) p.setMapExpanded(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [p]);
  const onDragStart = (event: DragStartEvent) => {
    const card = event.activatorEvent.target instanceof Element ? event.activatorEvent.target.closest('.stop-card') : null;
    const rect = event.active.rect.current.initial;
    const style = card ? getComputedStyle(card) : null;
    setDragStyle({ width: rect?.width, height: rect?.height, background: style?.background, borderColor: style?.borderColor, borderRadius: style?.borderRadius });
    setDragging(event.active.data.current as DragData);
  };
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const drag = event.active.data.current as DragData;
    const drop = event.over?.data.current as DropData | undefined;
    if (!drop) return;
    if (drop.type === 'day') p.dropOnDay(drag, drop.dayId);
    else {
      let index = drop.type === 'stop' || drop.type === 'insertion' ? drop.index : undefined;
      if (drop.type === 'stop' && drag.type === 'stop' && drag.routeId === drop.routeId) {
        const route = p.data.trip.days.flatMap((d) => d.routes).find((r) => r.id === drop.routeId);
        const oldIndex = route?.stops.findIndex((s) => s.id === drag.place.id) ?? 0;
        if (oldIndex < drop.index) index = drop.index + 1;
      }
      p.addToRoute(drag, drop.dayId, drop.routeId, index);
    }
  };
  const draggedDay = dragging?.type === 'stop' ? p.data.trip.days.find(day => day.id === dragging.dayId) : undefined;
  const draggedRoute = dragging?.type === 'stop' ? draggedDay?.routes.find(route => route.id === dragging.routeId) : undefined;
  const mapDrawerHeight = p.mapExpanded ? 0 : drawerHeight;
  return (
    <DndContext
      id="trip-planner-dnd"
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      autoScroll={{ threshold: { x: 0.12, y: 0.18 }, acceleration: 8 }}
      accessibility={{
        screenReaderInstructions: {
          draggable: '按空格开始拖动，用方向键移动，再按空格放下；Escape 取消。',
        },
      }}
    >
      <main className={`app-window ${p.mapExpanded ? 'map-expanded' : ''}`}>
        <TripHeader onTransfer={() => setTransferOpen(true)} onAI={() => setAiOpen(true)} onSettings={() => setSettingsOpen(true)} />
        <div className="workspace">
          <Sidebar dragging={!!dragging} />
          <section className="map-area" aria-label="地图与地点收藏" style={{ '--favorite-drawer-height': `${mapDrawerHeight}px` } as CSSProperties}>
            {p.ready && <MapView drawerHeight={mapDrawerHeight} />}
            <PlaceSearch />
            <FavoriteDrawer height={drawerHeight} onHeightChange={setDrawerHeight} dragging={!!dragging} />
          </section>
        </div>
        <div className="small-screen-notice">建议使用桌面端体验完整行程编辑功能</div>
      </main>
      <DragOverlay adjustScale={false} dropAnimation={{ duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {dragging?.type === 'stop' && draggedDay && draggedRoute ? <StopCardPreview stop={dragging.place} number={dayStopOffset(draggedDay, draggedRoute.id) + draggedRoute.stops.findIndex(stop => stop.id === dragging.place.id) + 1} color={draggedDay.color} style={dragStyle} /> : dragging && (
          <div className="drag-preview glass">
            <GripVertical size={17} />
            <MapPin size={21} />
            <strong>{dragging.place.name}</strong>
          </div>
        )}
      </DragOverlay>
      <PlannerDialogs />
      {transferOpen && <TransferDialog onClose={() => setTransferOpen(false)} />}
      {aiOpen && <AIDialog onClose={() => setAiOpen(false)} />}
      {settingsOpen && <MapSettings onClose={() => setSettingsOpen(false)} />}
      {!p.ready && <div className="startup-overlay"><LoadingPanel detail="正在恢复上次的计划与浏览位置" completed={1} /></div>}
      {p.planBusy && <div className="plan-operation-overlay" role="status">正在保存计划…</div>}
      {p.cityTarget && <CityDialog key={`${p.cityTarget.dayId}:${p.cityTarget.routeId}`} />}
      {p.repairOpen && <PoiRepairDialog />}
      <div className={`toast ${p.toast ? 'visible' : ''}`} role="status">
        <Check size={17} />
        {p.toast}
      </div>
    </DndContext>
  );
}
