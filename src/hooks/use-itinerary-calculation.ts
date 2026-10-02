'use client';
import { useEffect, useRef, useState } from 'react';
import type { PlannerData, RouteResult } from '@/lib/types';
import { connectedRoutes } from '@/lib/connected-routes';
import { routingFingerprint } from '@/lib/routing-fingerprint';
import { hasCoordinates, isVerifiedPlace } from '@/lib/location';
import { calculateVisits, calculationSignature, type CalculatedVisit } from '@/lib/itinerary-calculation';
import { mapProvider, mapService } from '@/services/map-service';
import { mapCacheNamespace } from '@/services/map-request';
import type { RouteSegments } from '@/services/amap-routing';

type SavedResult = RouteResult & { fingerprint: string; expiresAt: number };
type Snapshot = { tripId: string; scope: string; results: Record<string, SavedResult>; signature: string; visits: Record<string, CalculatedVisit> };
const empty = (tripId: string, scope: string): Snapshot => ({ tripId, scope, results: {}, signature: '', visits: {} });
const storageKey = (tripId: string) => `trip-map-calculation-v1:${tripId}`;
function restore(tripId: string, scope: string): Snapshot {
  const fallback = empty(tripId, scope);
  try {
    const raw = localStorage.getItem(storageKey(tripId));
    if (!raw || raw.length > 4_000_000) return fallback;
    const saved = JSON.parse(raw) as Snapshot;
    if (saved.tripId !== tripId || saved.scope !== scope || !saved.results || typeof saved.signature !== 'string') return fallback;
    const results: Record<string, SavedResult> = {};
    for (const [id, result] of Object.entries(saved.results)) {
      const g = result?.geometry;
      if (result?.status !== 'ready' || typeof result.fingerprint !== 'string' || result.expiresAt <= Date.now() || !Number.isFinite(result.expiresAt) || !g || !Array.isArray(g.path) || !Array.isArray(g.legs)) continue;
      if (![g.distance, g.duration, ...g.legs.flatMap(l => [l?.distance, l?.duration])].every(n => Number.isFinite(n) && n >= 0)) continue;
      if ([g.path, ...(g.paths ?? []), ...(g.connectors ?? [])].some(path => !Array.isArray(path) || path.some(p => !p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat) || Math.abs(p.lng) > 180 || Math.abs(p.lat) > 90))) continue;
      results[id] = result;
    }
    // Derived times are rebuilt locally from validated route legs, never trusted from storage.
    return { ...fallback, results, signature: saved.signature };
  } catch { return fallback; }
}

export function useItineraryCalculation(data: PlannerData, ready: boolean, notify: (text: string) => void) {
  const scope = `${mapProvider}:${mapCacheNamespace()}`;
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty('', ''));
  const [calculating, setCalculating] = useState(false);
  const activeRun = useRef(0), busy = useRef(false);
  const retained = useRef<Record<string, RouteSegments>>({});
  const signature = calculationSignature(data);
  const latest = useRef({ data, scope, signature }); latest.current = { data, scope, signature };
  const saved = useRef(snapshot); saved.current = snapshot;
  useEffect(() => {
    if (!ready) return;
    activeRun.current++; busy.current = false; setCalculating(false); retained.current = {};
    const restored = restore(data.trip.id, scope);
    if (restored.signature === calculationSignature(latest.current.data)) restored.visits = calculateVisits(latest.current.data, restored.results);
    saved.current = restored; setSnapshot(restored);
    return () => { activeRun.current++; };
  }, [ready, data.trip.id, scope]);
  useEffect(() => {
    if (!ready || snapshot.tripId !== data.trip.id || snapshot.scope !== scope) return;
    const timer = setTimeout(() => {
      try {
        const value = JSON.stringify({ ...snapshot, results: Object.fromEntries(Object.entries(snapshot.results).filter(([, r]) => r.status === 'ready')) });
        if (value.length <= 4_000_000) localStorage.setItem(storageKey(snapshot.tripId), value);
      } catch { /* Route cache is optional; the plan itself is saved separately. */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [snapshot, data.trip.id, scope, ready]);

  const routeResults: Record<string, RouteResult> = {};
  if (snapshot.tripId === data.trip.id && snapshot.scope === scope) {
    for (const route of data.trip.days.flatMap(connectedRoutes)) {
      const result = snapshot.results[route.id];
      if (result?.fingerprint === routingFingerprint(route.mode, route.stops, route.city?.name) && (result.status !== 'ready' || result.expiresAt > Date.now())) routeResults[route.id] = result;
    }
  }
  const itineraryDirty = snapshot.signature !== signature || data.trip.days.flatMap(connectedRoutes).some(r => r.visible && r.stops.length > 0 && routeResults[r.id]?.status !== 'ready');
  const visits = !itineraryDirty ? snapshot.visits : {};

  const calculateItinerary = async () => {
    if (busy.current || !ready) return;
    busy.current = true; setCalculating(true);
    const run = ++activeRun.current, input = latest.current.data, inputScope = latest.current.scope;
    const expected = latest.current.signature;
    const isCurrent = () => activeRun.current === run && latest.current.scope === inputScope && latest.current.signature === expected;
    const routes = input.trip.days.flatMap(connectedRoutes).filter(r => r.visible && r.stops.length);
    const routeIds = new Set(routes.map(route => route.id));
    for (const id of Object.keys(retained.current)) if (!routeIds.has(id)) delete retained.current[id];
    const results: Record<string, SavedResult> = {};
    const publish = (complete = false) => {
      if (!isCurrent()) return;
      const next = { tripId: input.trip.id, scope: inputScope, results: { ...results }, signature: complete ? expected : '', visits: complete ? calculateVisits(input, results) : {} };
      saved.current = next; setSnapshot(next);
    };
    const previous = saved.current.tripId === input.trip.id && saved.current.scope === inputScope ? saved.current.results : {};
    for (const route of routes) {
      const fingerprint = routingFingerprint(route.mode, route.stops, route.city?.name), existing = previous[route.id];
      results[route.id] = existing?.status === 'ready' && existing.fingerprint === fingerprint && existing.expiresAt > Date.now() ? existing : { status: 'loading', fingerprint, expiresAt: 0 };
    }
    publish();
    try {
      await Promise.all(routes.map(async route => {
        if (results[route.id].status === 'ready' || !isCurrent()) return;
        try {
          if (!route.stops.every(hasCoordinates)) throw new Error('含待定位地点，请先确认地点位置');
          if (mapProvider !== 'mock' && !route.stops.every(isVerifiedPlace)) throw new Error('请先确认高德地点位置');
          const calculate = { walking: mapService.calculateWalkingRoute, driving: mapService.calculateDrivingRoute, riding: mapService.calculateRidingRoute, subway: mapService.calculateSubwayRoute }[route.mode];
          const geometry = await calculate(route.stops, isCurrent, retained.current[route.id] ??= new Map(), route.city?.name);
          if (!isCurrent()) return;
          results[route.id] = { ...results[route.id], status: 'ready', geometry, expiresAt: geometry.expiresAt ?? Date.now() + 3 * 86400000 };
        } catch (error) {
          if (!isCurrent()) return;
          results[route.id] = { ...results[route.id], status: 'error', error: error instanceof Error ? error.message : '路程计算失败' };
        }
        publish();
      }));
      if (isCurrent()) {
        publish(true);
        const failures = Object.values(results).filter(r => r.status === 'error').length;
        notify(failures ? `${failures} 段未能计算，请确认地点后重试` : '路程与预计到达时间已更新');
      } else if (activeRun.current === run) {
        setSnapshot(current => ({ ...current, signature: '', results: Object.fromEntries(Object.entries(current.results).filter(([, r]) => r.status !== 'loading')) }));
        notify('行程已修改，点击计算以更新结果');
      }
    } finally {
      if (activeRun.current === run) { busy.current = false; setCalculating(false); }
    }
  };
  return { routeResults, visits, itineraryDirty, calculating, calculateItinerary, recalculateRoute: (_routeId: string) => calculateItinerary() };
}
