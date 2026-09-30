'use client';
import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { COLORS, initialData, makeId } from '@/lib/data';
import { insertPlace, moveStop, newRoute, normalize, reorder, updateRoute } from '@/lib/planner';
import {
  Day,
  DragData,
  Place,
  PlannerData,
  Route,
  RouteResult,
  Selection,
  TravelMode,
} from '@/lib/types';
import { mapService, mapProvider } from '@/services/map-service';
import { migrateData, isVerifiedPlace } from '@/lib/location';
import { dayConnections } from '@/lib/connections';
import { parsePlannerData } from '@/lib/transfer';
import { routingFingerprint } from '@/lib/routing-fingerprint';
import { selectedCity, setCity } from '@/lib/city';
import type { City } from '@/lib/types';
import { updatePlanLibrary } from '@/lib/plan-library';
import type { RouteSegments } from '@/services/amap-routing';
import { legacyLibrary, readLibrary, writeLibrary, type SavedLibrary } from '@/services/plan-storage';
import { readWorkspaceMemory, restoreSelection, writeWorkspaceMemory } from '@/lib/workspace-memory';

type History = { past: PlannerData[]; present: PlannerData; future: PlannerData[] };
type Action =
  | { type: 'edit'; update: (data: PlannerData) => PlannerData }
  | { type: 'load'; data: PlannerData }
  | { type: 'undo' | 'redo' };
function historyReducer(state: History, action: Action): History {
  if (action.type === 'load') return { past: [], present: action.data, future: [] };
  if (action.type === 'undo')
    return state.past.length
      ? {
          past: state.past.slice(0, -1),
          present: state.past[state.past.length - 1],
          future: [state.present, ...state.future],
        }
      : state;
  if (action.type === 'redo')
    return state.future.length
      ? {
          past: [...state.past, state.present],
          present: state.future[0],
          future: state.future.slice(1),
        }
      : state;
  if (action.type === 'edit') {
    const present = action.update(state.present);
    return JSON.stringify(present) === JSON.stringify(state.present)
      ? state
      : { past: [...state.past.slice(-49), state.present], present, future: [] };
  }
  return state;
}
export type DialogConfig = {
  title: string;
  description?: string;
  initial?: string;
  label?: string;
  destructive?: boolean;
  onConfirm: (value: string) => void;
};
export type Destination = { drag: DragData; dayId?: string };
function usePlannerState(initialLibrary?: Promise<SavedLibrary>) {
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialData,
    future: [],
  });
  const data = history.present;
  const [plans, setPlans] = useState<PlannerData[]>([]);
  const [focusedDayId, setFocusedDayId] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const planOperation = useRef(false);
  const [saveStatus, setSaveStatus] = useState('已保存');
  const storageWritable = useRef(true);
  const revision = useRef(0);
  const savedSnapshot = useRef('');
  const saving = useRef<Promise<boolean> | null>(null);
  const latestPlans = useRef(plans); latestPlans.current = plans;
  const [selection, setSelection] = useState<Selection>({
    activeDayId: 'day-1',
    activeRouteId: 'route-1',
    activeStopId: null,
  });
  const [expandedDays, setExpandedDays] = useState(new Set(['day-1']));
  const [expandedRoutes, setExpandedRoutes] = useState(new Set(['route-1']));
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [placeSource, setPlaceSource] = useState<'planned' | 'favorite' | 'searchResult'>(
    'planned',
  );
  const [destination, setDestination] = useState<Destination | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [toast, setToast] = useState('');
  const [cityTarget, setCityTarget] = useState<{ dayId: string; routeId?: string } | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const [routeResults, setRouteResults] = useState<Record<string, RouteResult>>({});
  const [transferResults, setTransferResults] = useState<Record<string, RouteResult>>({});
  const routeSegments = useRef<Record<string, RouteSegments>>({});
  const transferSegments = useRef<Record<string, RouteSegments>>({});
  const transferVersions = useRef<Record<string, number>>({});
  const transferFingerprints = useRef<Record<string, string>>({});
  const [transferRetry, setTransferRetry] = useState(0);
  const fingerprints = useRef<Record<string, string>>({});
  const generations = useRef<Record<string, number>>({});
  const latestData = useRef(data);
  latestData.current = data;
  useEffect(() => () => {
    Object.keys(generations.current).forEach(id => { generations.current[id] += 1; });
    Object.keys(transferVersions.current).forEach(id => { transferVersions.current[id] += 1; });
    fingerprints.current = {};
    transferFingerprints.current = {};
    routeSegments.current = {};
    transferSegments.current = {};
  }, []);
  useEffect(() => {
    if (!ready) return;
    const connections = data.trip.days.flatMap(dayConnections).filter(c => c.enabled);
    const live = new Set(connections.map(c => c.id));
    for (const id of Object.keys(transferSegments.current)) if (!live.has(id)) delete transferSegments.current[id];
    for (const id of Object.keys(transferFingerprints.current)) if (!live.has(id)) {
      transferVersions.current[id] = (transferVersions.current[id] ?? 0) + 1;
      delete transferFingerprints.current[id];
      delete transferSegments.current[id];
    }
    connections.forEach(connection => {
      const stops = [connection.from.stops.at(-1)!, connection.to.stops[0]];
      const fingerprint = JSON.stringify([routingFingerprint(connection.mode, stops), transferRetry]);
      if (transferFingerprints.current[connection.id] === fingerprint) return;
      transferFingerprints.current[connection.id] = fingerprint;
      const version = (transferVersions.current[connection.id] ?? 0) + 1;
      transferVersions.current[connection.id] = version;
      const isCurrent = () => {
        const live = latestData.current.trip.days.flatMap(dayConnections).find(c => c.id === connection.id);
        return transferVersions.current[connection.id] === version && !!live?.enabled && JSON.stringify([routingFingerprint(live.mode, [live.from.stops.at(-1)!, live.to.stops[0]]), transferRetry]) === fingerprint;
      };
      setTransferResults(prev => ({ ...prev, [connection.id]: { status: 'loading' } }));
      void (async () => {
        try {
          if (mapProvider !== 'mock' && stops.some(stop => !isVerifiedPlace(stop))) throw new Error('转场端点待确认');
          const calculate = { driving: mapService.calculateDrivingRoute, walking: mapService.calculateWalkingRoute, riding: mapService.calculateRidingRoute }[connection.mode];
          const geometry = await calculate(stops, isCurrent, transferSegments.current[connection.id] ??= new Map());
          if (isCurrent()) setTransferResults(prev => ({ ...prev, [connection.id]: { status: 'ready', geometry } }));
        } catch (error) {
          if (isCurrent()) setTransferResults(prev => ({ ...prev, [connection.id]: { status: 'error', error: error instanceof Error ? error.message : '转场规划失败' } }));
        }
      })();
    });
  }, [data, transferRetry, ready]);
  const commit = (update: (data: PlannerData) => PlannerData) => dispatch({ type: 'edit', update });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let library = await (initialLibrary ?? readLibrary());
        if (!library.plans.length) {
          const legacy = legacyLibrary();
          const firstPlan = blankPlan();
          try { library = await writeLibrary({ revision: library.revision, ...(legacy ?? { currentId: firstPlan.trip.id, plans: [firstPlan] }) }); }
          catch (error) { library = await readLibrary(); if (!library.plans.length) throw error; }
        }
        if (!active) return;
        const current = library.plans.find(p => p.trip.id === library.currentId)!;
        revision.current = library.revision;
        latestData.current = current; latestPlans.current = library.plans;
        savedSnapshot.current = JSON.stringify({ currentId: current.trip.id, plans: updatePlanLibrary(library.plans, current) });
        setPlans(library.plans); dispatch({ type: 'load', data: current });
        const restored = restoreSelection(current, readWorkspaceMemory(current.trip.id)?.selection);
        setSelection(restored);
        setExpandedDays(new Set(restored.activeDayId ? [restored.activeDayId] : []));
        setExpandedRoutes(new Set(restored.activeRouteId ? [restored.activeRouteId] : []));
      } catch (error) {
        if (!active) return;
        storageWritable.current = false;
        setToast(error instanceof Error ? error.message : '计划库读取失败；请先导出再重试');
      }
      if (active) setReady(true);
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (ready) writeWorkspaceMemory(data.trip.id, { selection });
  }, [ready, data.trip.id, selection]);
  const snapshot = () => JSON.stringify({ currentId: latestData.current.trip.id, plans: updatePlanLibrary(latestPlans.current, migrateData(latestData.current)) });
  const flushSave = async (): Promise<boolean> => {
    if (!ready || !storageWritable.current) return false;
    if (saving.current) { if (!await saving.current) return false; return flushSave(); }
    const payload = snapshot();
    if (payload === savedSnapshot.current) return true;
    setSaveStatus('保存中…');
    const task = (async () => {
      try {
        const result = await writeLibrary({ ...JSON.parse(payload), revision: revision.current });
        revision.current = result.revision; savedSnapshot.current = payload;
        latestPlans.current = updatePlanLibrary(latestPlans.current, latestData.current); setPlans(latestPlans.current);
        setSaveStatus('已保存到本机'); return true;
      } catch (error) {
        setSaveStatus('保存失败 · 请导出备份');
        setToast(error instanceof Error ? error.message : '保存失败');
        return false;
      }
    })();
    saving.current = task;
    try { if (!await task) return false; } finally { saving.current = null; }
    return snapshot() === savedSnapshot.current || flushSave();
  };
  useEffect(() => {
    if (!ready) return;
    if (!storageWritable.current) { setSaveStatus('原数据已保留 · 仅本次会话'); return; }
    const timer = setTimeout(() => { void flushSave(); }, 250);
    return () => clearTimeout(timer);
  }, [data, ready, plans]);
  useEffect(() => {
    window.tripMapFlush = flushSave;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (snapshot() !== savedSnapshot.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { delete window.tripMapFlush; window.removeEventListener('beforeunload', beforeUnload); };
  });
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setInterval(() => {
      if (document.hidden || saving.current || planOperation.current || snapshot() !== savedSnapshot.current) return;
      void readLibrary().then(library => {
        if (!active || saving.current || planOperation.current || snapshot() !== savedSnapshot.current || library.revision <= revision.current) return;
        const current = library.plans.find(p => p.trip.id === latestData.current.trip.id) ?? library.plans[0];
        if (!current) return;
        revision.current = library.revision; latestPlans.current = library.plans; latestData.current = current;
        savedSnapshot.current = JSON.stringify({ currentId: current.trip.id, plans: updatePlanLibrary(library.plans, current) });
        setPlans(library.plans); dispatch({ type: 'load', data: current }); setSaveStatus('已同步本机计划');
      }).catch(() => {});
    }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [ready]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (focusedDayId && !data.trip.days.some(day => day.id === focusedDayId)) setFocusedDayId(null);
    setSelection((current) => {
      if (current.activeStopId) {
        for (const day of data.trip.days)
          for (const route of day.routes) {
            if (route.stops.some((stop) => stop.id === current.activeStopId)) {
              return current.activeDayId === day.id && current.activeRouteId === route.id
                ? current
                : {
                    activeDayId: day.id,
                    activeRouteId: route.id,
                    activeStopId: current.activeStopId,
                  };
            }
          }
      }
      const day = data.trip.days.find((day) => day.id === current.activeDayId);
      const route = day?.routes.find((route) => route.id === current.activeRouteId);
      if (day && (route || current.activeRouteId === null) && current.activeStopId === null)
        return current;
      return {
        activeDayId: day?.id ?? data.trip.days[0]?.id ?? null,
        activeRouteId: route?.id ?? null,
        activeStopId: null,
      };
    });
    if (placeSource === 'planned')
      setSelectedPlace((current) =>
        current &&
        !data.trip.days.some((day) =>
          day.routes.some((route) => route.stops.some((stop) => stop.id === current.id)),
        )
          ? null
          : current,
      );
  }, [data, placeSource, focusedDayId]);
  const recalculateRoute = async (routeId: string) => {
    const route = latestData.current.trip.days
      .flatMap((d) => d.routes)
      .find((r) => r.id === routeId);
    if (!route) return;
    const generation = (generations.current[routeId] ?? 0) + 1;
    generations.current[routeId] = generation;
    const isCurrent = () => generations.current[routeId] === generation && latestData.current.trip.days.some(day => day.routes.some(r => r.id === routeId && routingFingerprint(r.mode, r.stops) === routingFingerprint(route.mode, route.stops)));
    setRouteResults((prev) => ({
      ...prev,
      [routeId]: {
        status: 'loading',
      },
    }));
    try {
      if (mapProvider !== 'mock' && route.stops.some(stop => !isVerifiedPlace(stop)))
        throw new Error('含演示或未知来源坐标，请搜索并确认高德地点');
      const calculate = {
        driving: mapService.calculateDrivingRoute,
        walking: mapService.calculateWalkingRoute,
        riding: mapService.calculateRidingRoute,
      }[route.mode];
      const geometry = await calculate(route.stops, isCurrent, routeSegments.current[routeId] ??= new Map());
      if (isCurrent())
        setRouteResults((prev) => ({ ...prev, [routeId]: { status: 'ready', geometry } }));
    } catch (error) {
      if (isCurrent())
        setRouteResults((prev) => ({ ...prev, [routeId]: { status: 'error', error: error instanceof Error ? error.message : '路线规划失败' } }));
    }
  };
  useEffect(() => {
    if (!ready) return;
    const ids = new Set(data.trip.days.flatMap(day => day.routes.map(route => route.id)));
    for (const id of Object.keys(routeSegments.current)) if (!ids.has(id)) delete routeSegments.current[id];
    Object.keys(fingerprints.current).filter(id => !ids.has(id)).forEach(id => {
      generations.current[id] = (generations.current[id] ?? 0) + 1;
      delete fingerprints.current[id];
      delete routeSegments.current[id];
    });
    data.trip.days.forEach((d) =>
      d.routes.forEach((r) => {
        const fingerprint = routingFingerprint(r.mode, r.stops);
        if (fingerprints.current[r.id] !== fingerprint) {
          fingerprints.current[r.id] = fingerprint;
          void recalculateRoute(r.id);
        }
      }),
    );
  }, [data, ready]); // Each route owns its pending calculation; stale responses are ignored.
  const expandDay = (id: string) => setExpandedDays((prev) => new Set(prev).add(id));
  const expandRoute = (id: string) => setExpandedRoutes((prev) => new Set(prev).add(id));
  const allDaysExpanded =
    data.trip.days.length > 0 && data.trip.days.every((day) => expandedDays.has(day.id));
  const toggleAllDays = () =>
    setExpandedDays(allDaysExpanded ? new Set() : new Set(data.trip.days.map((day) => day.id)));
  const toggleSet = (prev: Set<string>, id: string) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const selectDay = (id: string, toggle = true) => {
    setFocusedDayId(id);
    setSelection({ activeDayId: id, activeRouteId: null, activeStopId: null });
    setSelectedPlace(null);
    if (toggle) setExpandedDays((prev) => toggleSet(prev, id));
    else expandDay(id);
  };
  const selectRoute = (dayId: string, routeId: string, toggle = true) => {
    setFocusedDayId(dayId);
    setSelection({ activeDayId: dayId, activeRouteId: routeId, activeStopId: null });
    setSelectedPlace(null);
    expandDay(dayId);
    if (toggle) setExpandedRoutes((prev) => toggleSet(prev, routeId));
    else expandRoute(routeId);
  };
  const openPlace = (
    place: Place,
    source: typeof placeSource = 'planned',
    dayId?: string,
    routeId?: string,
  ) => {
    setSelectedPlace(place);
    setPlaceSource(source);
    if (dayId && routeId) {
      setSelection({ activeDayId: dayId, activeRouteId: routeId, activeStopId: place.id });
      expandDay(dayId);
      expandRoute(routeId);
    }
  };
  const addToRoute = (drag: DragData, dayId: string, routeId: string, index?: number) => {
    commit((current) =>
      drag.type === 'stop'
        ? moveStop(
            current,
            drag.routeId,
            routeId,
            drag.place.id,
            index ??
              current.trip.days.flatMap((d) => d.routes).find((r) => r.id === routeId)!.stops
                .length,
          )
        : insertPlace(current, routeId, drag.place, index),
    );
    selectRoute(dayId, routeId, false);
    setDestination(null);
    setToast(drag.type === 'stop' ? '地点顺序已更新' : `已将${drag.place.name}加入行程`);
  };
  const createRouteWithPlace = (dayId: string, drag: DragData, name = '默认路线') => {
    const day = data.trip.days.find((d) => d.id === dayId);
    if (!day) return;
    const route = newRoute(day.color, name);
    commit((current) => {
      let next = {
        ...current,
        trip: {
          ...current.trip,
          days: current.trip.days.map((d) =>
            d.id === dayId ? { ...d, routes: [...d.routes, route] } : d,
          ),
        },
      };
      next =
        drag.type === 'stop'
          ? moveStop(next, drag.routeId, route.id, drag.place.id, 0)
          : insertPlace(next, route.id, drag.place);
      return next;
    });
    selectRoute(dayId, route.id, false);
    setDestination(null);
    setToast('已创建路线并加入地点');
  };
  const dropOnDay = (drag: DragData, dayId: string) => {
    const day = data.trip.days.find((d) => d.id === dayId);
    if (!day) return;
    if (!day.routes.length) createRouteWithPlace(dayId, drag);
    else if (day.routes.length === 1) addToRoute(drag, dayId, day.routes[0].id);
    else setDestination({ drag, dayId });
  };
  const toggleFavorite = (place: Place) => {
    const id = 'placeId' in place ? String(place.placeId) : place.id;
    const exists = data.favorites.some((p) => p.id === id);
    commit((current) => ({
      ...current,
      favorites: exists
        ? current.favorites.filter((p) => p.id !== id)
        : [...current.favorites, { ...place, id }],
    }));
    setToast(exists ? '已取消收藏' : '已加入收藏地址');
  };
  const removeStop = (routeId: string, stopId: string) => {
    commit((current) =>
      updateRoute(current, routeId, (route) => ({
        ...route,
        stops: normalize(route.stops.filter((s) => s.id !== stopId)),
      })),
    );
    if (selection.activeStopId === stopId) {
      setSelectedPlace(null);
      setSelection((prev) => ({ ...prev, activeStopId: null }));
    }
    setToast('已移除地点，可撤销');
  };
  const editRoute = (routeId: string, patch: Partial<Route>) =>
    commit((current) => updateRoute(current, routeId, (r) => ({ ...r, ...patch })));
  const addDay = () => {
    const index = data.trip.days.length;
    const date = new Date(`${data.trip.days.at(-1)?.date ?? '2026-04-11'}T12:00:00`);
    date.setDate(date.getDate() + 1);
    const day: Day = {
      id: makeId('day'),
      name: `Day ${index + 1}`,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      color: COLORS[index % COLORS.length],
      routes: [],
    };
    commit((current) => ({
      ...current,
      trip: { ...current.trip, days: [...current.trip.days, day] },
    }));
    selectDay(day.id, false);
    setToast('新的一天，新的期待');
  };
  const addRoute = (day: Day) =>
    setDialog({
      title: '添加路线',
      label: '路线名称',
      initial: day.routes.length ? '下午路线' : '默认路线',
      onConfirm: (name) => {
        const route = newRoute(day.color, name);
        commit((current) => ({
          ...current,
          trip: {
            ...current.trip,
            days: current.trip.days.map((d) =>
              d.id === day.id ? { ...d, routes: [...d.routes, route] } : d,
            ),
          },
        }));
        selectRoute(day.id, route.id, false);
      },
    });
  const reorderDay = (id: string, direction: number) =>
    commit((current) => {
      const index = current.trip.days.findIndex((d) => d.id === id);
      const target = index + direction;
      if (target < 0 || target >= current.trip.days.length) return current;
      return {
        ...current,
        trip: { ...current.trip, days: reorder(current.trip.days, index, target) },
      };
    });
  const reorderRoute = (dayId: string, id: string, direction: number) =>
    commit((current) => ({
      ...current,
      trip: {
        ...current.trip,
        days: current.trip.days.map((d) => {
          if (d.id !== dayId) return d;
          const index = d.routes.findIndex((r) => r.id === id);
          const target = index + direction;
          return target >= 0 && target < d.routes.length
            ? { ...d, routes: reorder(d.routes, index, target) }
            : d;
        }),
      },
    }));
  const fitAllVisibleRoutes = () => {
    setFocusedDayId(null);
    const coordinates = data.trip.days.flatMap((d) =>
      d.routes.filter((r) => r.visible).flatMap((r) => r.stops),
    );
    mapService.fitView(mapProvider === 'mock' ? coordinates : coordinates.filter(isVerifiedPlace));
    setSelectedPlace(null);
  };
  const importData = (next: PlannerData) => {
    setFocusedDayId(null);
    if (JSON.stringify(migrateData(next)) === JSON.stringify(data)) {
      setToast('当前行程与导入内容相同，已保留路线结果');
      return;
    }
    Object.keys(transferVersions.current).forEach(id => { transferVersions.current[id] += 1; });
    transferFingerprints.current = {};
    setTransferResults({});
    if (next.trip.id !== data.trip.id) {
      const archived = updatePlanLibrary(latestPlans.current, latestData.current);
      latestPlans.current = archived; setPlans(archived);
      routeSegments.current = {};
      transferSegments.current = {};
    }
    Object.keys(generations.current).forEach((id) => {
      generations.current[id] += 1;
    });
    fingerprints.current = {};
    setRouteResults({});
    commit(() => migrateData(next));
    const day = next.trip.days[0],
      route = day?.routes[0];
    setSelection({
      activeDayId: day?.id ?? null,
      activeRouteId: route?.id ?? null,
      activeStopId: null,
    });
    setExpandedDays(new Set(day ? [day.id] : []));
    setExpandedRoutes(new Set(route ? [route.id] : []));
    setSelectedPlace(null);
    setDestination(null);
    if (next.trip.id === data.trip.id) mapService.fitView(
      next.trip.days.flatMap((day) =>
        day.routes.filter((route) => route.visible).flatMap((route) => route.stops).filter(stop => mapProvider === 'mock' || isVerifiedPlace(stop)),
      ),
    );
    setToast('行程已导入，可通过撤销恢复原行程');
  };
  const switchPlan = async (next: PlannerData) => {
    if (!ready || planOperation.current) return;
    planOperation.current = true; setPlanBusy(true);
    try {
    if (!await flushSave()) { setToast('无法保存当前计划，未切换，请先导出备份'); return; }
    next = latestPlans.current.find(plan => plan.trip.id === next.trip.id) ?? next;
    const library = updatePlanLibrary(latestPlans.current, latestData.current, next);
    latestPlans.current = library;
    setPlans(library);
    importData(next);
    dispatch({ type: 'load', data: next });
    latestData.current = next;
    const restored = restoreSelection(next, readWorkspaceMemory(next.trip.id)?.selection);
    setSelection(restored);
    setExpandedDays(new Set(restored.activeDayId ? [restored.activeDayId] : []));
    setExpandedRoutes(new Set(restored.activeRouteId ? [restored.activeRouteId] : []));
    setToast(`已切换到 ${next.trip.name}`);
    } finally { planOperation.current = false; setPlanBusy(false); }
  };
  const blankPlan = (name = '新的旅行'): PlannerData => ({ version: 2, trip: { id: makeId('trip'), name, days: [{ id: makeId('day'), name: 'Day 1', date: new Date().toLocaleDateString('sv-SE'), color: COLORS[0], routes: [] }] }, favorites: [] });
  const deletePlan = (id: string) => {
    const target = updatePlanLibrary(latestPlans.current, latestData.current).find(plan => plan.trip.id === id);
    if (!target) return;
    setDialog({ title: `删除「${target.trip.name}」？`, description: '将删除这个计划及其路线、收藏，无法撤销。删除最后一个计划后会创建一个空白计划。', destructive: true, onConfirm: () => {
      if (planOperation.current) return;
      planOperation.current = true; setPlanBusy(true);
      void (async () => {
        try {
          if (!await flushSave()) return;
          const remaining = updatePlanLibrary(latestPlans.current, latestData.current).filter(plan => plan.trip.id !== id);
          if (!remaining.length) remaining.push(blankPlan());
          const next = remaining.find(plan => plan.trip.id === latestData.current.trip.id) ?? remaining[0];
          const library = await writeLibrary({ revision: revision.current, currentId: next.trip.id, plans: remaining });
          revision.current = library.revision;
          latestPlans.current = remaining; latestData.current = next;
          savedSnapshot.current = JSON.stringify({ currentId: next.trip.id, plans: remaining });
          setPlans(remaining);
          if (id === data.trip.id) {
            dispatch({ type: 'load', data: next });
            const restored = restoreSelection(next, readWorkspaceMemory(next.trip.id)?.selection);
            setSelection(restored); setFocusedDayId(null); setSelectedPlace(null); setDestination(null);
            setExpandedDays(new Set(restored.activeDayId ? [restored.activeDayId] : []));
            setExpandedRoutes(new Set(restored.activeRouteId ? [restored.activeRouteId] : []));
          }
          setSaveStatus('已保存到本机'); setToast(`已删除 ${target.trip.name}`);
        } catch (error) { setToast(error instanceof Error ? error.message : '删除失败，原计划已保留'); }
        finally { planOperation.current = false; setPlanBusy(false); }
      })();
    } });
  };
  return {
    ready, flushSave, planBusy, deletePlan,
    renamePlan: (id: string) => {
      const plan = updatePlanLibrary(latestPlans.current, latestData.current).find(item => item.trip.id === id);
      if (plan) setDialog({ title: '重命名旅行计划', label: '计划名称', initial: plan.trip.name, onConfirm: name => {
        if (id === latestData.current.trip.id) commit(current => ({ ...current, trip: { ...current.trip, name } }));
        else { latestPlans.current = latestPlans.current.map(item => item.trip.id === id ? { ...item, trip: { ...item.trip, name } } : item); setPlans(latestPlans.current); }
        setToast('计划名称已更新');
      } });
    },
    importBrowserPlans: async () => {
      const legacy = legacyLibrary();
      if (!legacy) throw new Error('此浏览器没有旧版计划；可使用 JSON 文件导入');
      if (!await flushSave()) throw new Error('当前行程尚未保存，请先导出备份');
      const library = updatePlanLibrary(latestPlans.current, latestData.current);
      let imported: PlannerData | undefined;
      for (const plan of legacy.plans) {
        const same = library.find(item => item.trip.id === plan.trip.id);
        if (same && JSON.stringify(same) === JSON.stringify(plan)) continue;
        const next = same ? { ...plan, trip: { ...plan.trip, id: makeId('trip'), name: `${plan.trip.name}（浏览器迁移）` } } : plan;
        library.push(next); imported ??= next;
      }
      if (!imported) throw new Error('旧版计划已在当前计划库中，无需重复导入');
      latestPlans.current = library; setPlans(library);
      importData(imported); dispatch({ type: 'load', data: imported });
      setToast('已导入此浏览器旧计划；原记录与备份仍保留');
    },
    plans: updatePlanLibrary(plans, data),
    switchPlan: (id: string) => { const next = plans.find(plan => plan.trip.id === id); if (next && id !== data.trip.id) switchPlan(next); },
    createPlan: () => setDialog({ title: '开启新的旅行计划', label: '计划名称', initial: '新的旅行', onConfirm: name => switchPlan(blankPlan(name)) }),
    focusedDayId,
    mapExpanded, setMapExpanded,
    mapDays: data.trip.days.filter(day => !focusedDayId || day.id === focusedDayId),
    currentCity: selectedCity(data, selection), cityTarget, setCityTarget, repairOpen, setRepairOpen,
    setTravelCity: (dayId: string, routeId: string | undefined, city: City | undefined) => { commit(current => setCity(current, dayId, routeId, city)); if (city) { setSelectedPlace(null); mapService.panTo(city, 11); } setCityTarget(null); setToast(city ? `已设置 ${city.name}，地点搜索将限定在该城市` : '已取消单独城市设置'); },
    locateCity: () => {
      const city = selectedCity(data, selection);
      if (city) { setSelectedPlace(null); mapService.panTo(city, 11); setToast(`已定位到 ${city.name} 中心`); }
      else if (selection.activeDayId) setCityTarget({ dayId: selection.activeDayId, ...(selection.activeRouteId ? { routeId: selection.activeRouteId } : {}) });
      else setToast('请先选择一天或一条路线');
    },
    selectDayOnly: (id: string) => {
      selectDay(id, false);
      setExpandedDays(new Set([id]));
      setFocusedDayId(id);
      const day = data.trip.days.find(day => day.id === id);
      setExpandedRoutes(new Set(day?.routes.map(route => route.id) ?? []));
      const stops = day?.routes.filter(route => route.visible).flatMap(route => route.stops).filter(stop => mapProvider === 'mock' || isVerifiedPlace(stop)) ?? [];
      if (stops.length) mapService.fitView(stops);
      else if (day?.city) mapService.panTo(day.city, 11);
    },
    selectRouteOnly: (dayId: string, routeId: string) => { setFocusedDayId(dayId); selectRoute(dayId, routeId, false); },
    toggleDay: (id: string) => setExpandedDays(prev => toggleSet(prev, id)),
    toggleRoute: (id: string) => setExpandedRoutes(prev => toggleSet(prev, id)),
    transferResults,
    retryTransfers: () => setTransferRetry(value => value + 1),
    editTransfer: (dayId: string, fromRouteId: string, toRouteId: string, enabled: boolean, mode: TravelMode) => commit(current => ({
      ...current, trip: { ...current.trip, days: current.trip.days.map(day => day.id !== dayId ? day : ({ ...day,
        transfers: [...(day.transfers ?? []).filter(t => t.fromRouteId !== fromRouteId || t.toRouteId !== toRouteId), { fromRouteId, toRouteId, enabled, mode }],
      })) },
    })),
    confirmPlace: (place: Place) => {
      const stopId = selection.activeStopId;
      const routeId = selection.activeRouteId;
      if (!stopId || !routeId || !isVerifiedPlace(place)) return;
      const old = data.trip.days.flatMap(day => day.routes).find(route => route.id === routeId)?.stops.find(stop => stop.id === stopId);
      if (!old) return;
      setDialog({ title: `替换「${old.name}」？`, description: `使用 ${place.name}（${place.address}），保留行程编号与位置，可撤销。`, onConfirm: () => {
        commit(current => updateRoute(current, routeId, route => ({ ...route, stops: route.stops.map(stop => stop.id === stopId ? { ...place, id: stop.id, order: stop.order, placeId: place.id } : stop) })));
        setSelectedPlace(null);
      } });
    },
    data,
    commit,
    importData,
    selection,
    expandedDays,
    expandedRoutes,
    allDaysExpanded,
    toggleAllDays,
    selectedPlace,
    setSelectedPlace,
    placeSource,
    destination,
    setDestination,
    dialog,
    setDialog,
    toast,
    setToast,
    searchFocus,
    setSearchFocus,
    routeResults,
    recalculateRoute,
    selectDay,
    selectRoute,
    openPlace,
    addToRoute,
    dropOnDay,
    createRouteWithPlace,
    toggleFavorite,
    removeStop,
    editRoute,
    addDay,
    addRoute,
    reorderDay,
    reorderRoute,
    fitAllVisibleRoutes,
    saveStatus,
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
  };
}
type PlannerContextType = ReturnType<typeof usePlannerState>;
const PlannerContext = createContext<PlannerContextType | null>(null);
export function PlannerProvider({ children, initialLibrary }: { children: React.ReactNode; initialLibrary?: Promise<SavedLibrary> }) {
  return <PlannerContext.Provider value={usePlannerState(initialLibrary)}>{children}</PlannerContext.Provider>;
}
export function usePlanner() {
  const value = useContext(PlannerContext);
  if (!value) throw new Error('PlannerProvider is required');
  return value;
}
