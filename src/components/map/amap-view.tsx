'use client';
import { routeLineStyle } from '@/lib/route-style';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Shrink, LocateFixed, Minus, Plus } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { dayStopOffset } from '@/lib/planner';
import { dayConnections } from '@/lib/connections';
import { isVerifiedPlace } from '@/lib/location';
import { loadAMap, lngLat, type AMapInstance, type AMapOverlay, type AMapSDK } from '@/services/amap-sdk';
import { mapProvider, mapService } from '@/services/map-service';
import { PlacePopover } from '../place-popover';
import { IconButton } from '../ui';
import { LoadingPanel } from '../loading-panel';
import { RouteLegend } from './route-legend';
import { initialViewport, readWorkspaceMemory, writeWorkspaceMemory } from '@/lib/workspace-memory';
import { mapPickedPlace } from '@/lib/map-pick';
import { mapFetch } from '@/services/map-request';
import type { Place } from '@/lib/types';
import { bindMapPicking, type MapPick } from '@/services/map-picking';
import { minimumPan, type Size } from '@/lib/map-geometry';

export function AMapView({ drawerHeight }: { drawerHeight: number }) {
  const p = usePlanner();
  const current = useRef(p); current.current = p;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<AMapInstance | null>(null);
  const [sdk, setSdk] = useState<AMapSDK | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tilesReady, setTilesReady] = useState(false);
  const [lookup, setLookup] = useState<{ id: string; loading: boolean; error?: string; poiId?: string } | null>(null);
  const [popoverSize, setPopoverSize] = useState<Size>({ width: 240, height: 164 });
  const onPopoverSize = useCallback((size: Size) => setPopoverSize(previous => previous.width === size.width && previous.height === size.height ? previous : size), []);
  const lookupController = useRef<AbortController | null>(null);
  const lookupVersion = useRef(0);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<AMapOverlay[]>([]);
  useEffect(() => {
    let cancelled = false;
    let instance: AMapInstance | undefined;
    let tileTimer: ReturnType<typeof setTimeout> | undefined;
    setError('');
    setTilesReady(false);
    if (mapProvider !== 'amap') { setError('地图模式无效，请配置 mock 或 amap'); return; }
    void loadAMap().then(api => {
      if (cancelled || !container.current) return;
      const planner = current.current;
      const viewport = initialViewport(planner.data, planner.selection, readWorkspaceMemory(planner.data.trip.id));
      instance = new api.Map(container.current, { zoom: viewport.zoom, center: lngLat(viewport.center), viewMode: '2D', resizeEnable: true, isHotspot: true, doubleClickZoom: false });
      instance.on('complete', () => { if (!cancelled) { clearTimeout(tileTimer); setTilesReady(true); setError(''); } });
      tileTimer = setTimeout(() => { if (!cancelled) setError('地图底图加载较慢，请检查网络后重试'); }, 20000);
      map.current = instance; setSdk(api);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : '地图加载失败'); });
    return () => { cancelled = true; clearTimeout(tileTimer); instance?.destroy(); map.current = null; setSdk(null); lookupController.current?.abort(); };
  }, [attempt]);
  useEffect(() => {
    const instance = map.current;
    if (!sdk || !instance) return;
    const tripId = p.data.trip.id;
    const viewport = initialViewport(p.data, p.selection, readWorkspaceMemory(tripId));
    instance.setZoom(viewport.zoom); instance.setCenter(lngLat(viewport.center));
    const save = () => { const center = instance.getCenter(); writeWorkspaceMemory(tripId, { center: { lng: center.lng, lat: center.lat }, zoom: instance.getZoom() }); };
    instance.on('moveend', save); instance.on('zoomend', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      if (map.current === instance) { save(); instance.off('moveend', save); instance.off('zoomend', save); }
      lookupController.current?.abort(); lookupVersion.current += 1; setLookup(null);
    };
  }, [sdk, p.data.trip.id]);
  const resolvePlace = async (place: Place) => {
    lookupController.current?.abort();
    const controller = new AbortController(); lookupController.current = controller;
    const version = ++lookupVersion.current;
    setLookup({ id: place.id, loading: true });
    try {
      const response = await mapFetch(`/api/amap/regeocode?lng=${place.lng}&lat=${place.lat}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '详细地址暂不可用');
      if (lookupVersion.current !== version || current.current.selectedPlace?.id !== place.id) return;
      current.current.openPlace({ ...place, address: result.address }, 'searchResult');
      setLookup({ id: place.id, loading: false });
    } catch (error) {
      if (controller.signal.aborted || lookupVersion.current !== version) return;
      setLookup({ id: place.id, loading: false, error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : '地址查询超时' });
    }
  };
  const resolveHotspot = async (poiId: string) => {
    lookupController.current?.abort();
    const controller = new AbortController(); lookupController.current = controller;
    const version = ++lookupVersion.current;
    current.current.setSelectedPlace(null);
    setLookup({ id: `amap:${poiId}`, poiId, loading: true });
    try {
      const response = await mapFetch(`/api/amap/place?id=${encodeURIComponent(poiId)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '地点详情暂不可用');
      if (lookupVersion.current !== version || controller.signal.aborted) return;
      current.current.openPlace(result.place, 'searchResult');
      setLookup(null);
    } catch (error) {
      if (controller.signal.aborted || lookupVersion.current !== version) return;
      setLookup({ id: `amap:${poiId}`, poiId, loading: false, error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : '地点查询超时' });
    }
  };
  const pickRef = useRef<(pick: MapPick) => void>(() => {});
  pickRef.current = pick => {
    if (pick.type === 'poi') { void resolveHotspot(pick.id); return; }
    const place = mapPickedPlace(pick.coordinate);
    current.current.openPlace(place, 'searchResult');
    void resolvePlace(place);
  };
  useEffect(() => {
    const instance = map.current;
    if (!sdk || !instance) return;
    const picking = bindMapPicking(instance, pick => pickRef.current(pick));
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      picking.cancel();
      lookupController.current?.abort(); lookupVersion.current += 1; setLookup(null);
    };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); picking.dispose(map.current === instance); };
  }, [sdk, p.data.trip.id]);
  useEffect(() => {
    const instance = map.current;
    if (!sdk || !instance) return;
    return mapService.subscribeViewport(command => {
      if (command.type === 'pan') { instance.setCenter(lngLat(command.coordinate)); if (command.zoom !== undefined) instance.setZoom(command.zoom); }
      // AMap avoid uses top, bottom, left, right (not CSS edge order).
      else if (command.coordinates.length) instance.setFitView(command.coordinates.map(point => new sdk.Marker({ position: lngLat(point) })), false, [100, drawerHeight + 60, 80, 80]);
    });
  }, [sdk, drawerHeight]);
  useEffect(() => {
    const instance = map.current;
    if (!sdk || !instance) return;
    const overlays: AMapOverlay[] = [];
    const marker = (point: Parameters<typeof isVerifiedPlace>[0], label: string, color: string, selected: boolean, click: () => void) => {
      if (!isVerifiedPlace(point)) return;
      const element = document.createElement('button');
      element.className = `amap-trip-marker${selected ? ' selected' : ''}`;
      element.textContent = label; element.title = point.name;
      element.setAttribute('aria-label', `${label} ${point.name}`);
      element.style.background = color;
      const overlay = new sdk.Marker({ position: lngLat(point), content: element, anchor: 'bottom-center', bubble: false, zIndex: selected ? 200 : 100 });
      overlay.on('click', click); overlays.push(overlay);
    };
    const planned = new Set<string>();
    p.mapDays.forEach(day => day.routes.filter(route => route.visible).forEach(route => {
      const result = p.routeResults[route.id];
      if (result?.status === 'ready' && result.geometry?.path.length) {
        for (const path of result.geometry.paths ?? [result.geometry.path]) {
          const style = routeLineStyle(p.selection.activeRouteId === route.id);
          const line = new sdk.Polyline({ path: path.map(lngLat), strokeColor: day.color, strokeWeight: style.width, strokeOpacity: style.opacity, isOutline: true, outlineColor: style.outlineColor, borderWeight: 2, lineJoin: 'round', lineCap: 'round', zIndex: style.zIndex, bubble: false });
          line.on('click', () => current.current.selectRoute(day.id, route.id, false));
          overlays.push(line);
        }
        for (const path of result.geometry.connectors ?? [])
          overlays.push(new sdk.Polyline({ path: path.map(lngLat), strokeColor: '#b7a088', strokeWeight: 2, strokeStyle: 'dashed' }));
      }
      route.stops.forEach((stop, index) => {
        planned.add(stop.placeId);
        marker(stop, String(dayStopOffset(day, route.id) + index + 1), day.color, p.selection.activeStopId === stop.id,
          () => current.current.openPlace(stop, 'planned', day.id, route.id));
      });
    }));
    p.mapDays.flatMap(dayConnections).filter(c => c.enabled && c.visible).forEach(c => {
      const result = p.transferResults[c.id];
      if (result?.status === 'ready' && result.geometry) {
        for (const path of result.geometry.paths ?? [result.geometry.path])
          overlays.push(new sdk.Polyline({ path: path.map(lngLat), strokeColor: '#8297b0', strokeWeight: 2, strokeStyle: 'dashed' }));
        for (const path of result.geometry.connectors ?? [])
          overlays.push(new sdk.Polyline({ path: path.map(lngLat), strokeColor: '#b7a088', strokeWeight: 2, strokeStyle: 'dashed' }));
      }
    });
    p.data.favorites.filter(place => !planned.has(place.id)).forEach(place =>
      marker(place, '☆', '#7b95b7', false, () => current.current.openPlace(place, 'favorite')));
    if (p.selectedPlace && p.placeSource === 'searchResult') marker(p.selectedPlace, '●', '#237bff', true, () => {});
    instance.add(overlays); overlayRef.current = overlays;
    return () => { if (map.current === instance) instance.remove(overlays); overlayRef.current = []; };
  }, [sdk, p.data, p.focusedDayId, p.routeResults, p.transferResults, p.selection, p.selectedPlace, p.placeSource]);
  useEffect(() => {
    const instance = map.current;
    if (!sdk || !instance || !p.selectedPlace || !isVerifiedPlace(p.selectedPlace)) { setAnchor(null); return; }
    const place = p.selectedPlace;
    const update = () => {
      const point = instance.lngLatToContainer(lngLat(place));
      setAnchor({ x: point.x, y: point.y - 38 });
    };
    const point = instance.lngLatToContainer(lngLat(place));
    const width = container.current?.clientWidth ?? 800, height = container.current?.clientHeight ?? 700;
    const rect = container.current?.getBoundingClientRect();
    const search = container.current?.parentElement?.parentElement?.querySelector('.place-search')?.getBoundingClientRect();
    const obstacles = rect && search ? [{ x: search.left - rect.left - 8, y: search.top - rect.top - 8, width: search.width + 16, height: search.height + 16 }] : [];
    const delta = minimumPan({ x: point.x - popoverSize.width / 2, y: point.y - 38 - popoverSize.height, width: popoverSize.width, height: popoverSize.height + 46 }, { x: 14, y: 14, width: width - 28, height: Math.max(0, height - drawerHeight - 42) }, obstacles);
    // Keep a clicked landmark in place whenever the compact card already fits.
    if (Math.abs(delta.x) > .5 || Math.abs(delta.y) > .5) instance.panBy(delta.x, delta.y);
    update();
    instance.on('mapmove', update); instance.on('zoomchange', update); instance.on('resize', update);
    return () => { if (map.current === instance) { instance.off('mapmove', update); instance.off('zoomchange', update); instance.off('resize', update); } };
  }, [sdk, p.selectedPlace, drawerHeight, popoverSize]);
  const unresolved = p.data.trip.days.flatMap(day => day.routes.flatMap(route => route.stops)).filter(place => !isVerifiedPlace(place)).length;
  return <div className="map-view" data-testid="map-view">
    <div ref={container} className="amap-container" />
    {error ? <div className="map-provider-notice" role="alert">{error}<button onClick={() => setAttempt(n => n + 1)}>重试</button></div>
      : !tilesReady ? <div className="map-loading-overlay"><LoadingPanel compact title="正在展开地图" detail={sdk ? '正在载入城市底图' : '正在连接高德地图'} completed={sdk ? 1 : 0} total={2} /></div>
      : unresolved > 0 && <div className="map-provider-notice">{unresolved} 个地点待确认<button onClick={() => p.setRepairOpen(true)}>搜索并批量确认</button></div>}
    {lookup?.poiId && <div className="map-poi-status" role="status">{lookup.loading ? '正在读取地标信息…' : lookup.error}{!lookup.loading && <button onClick={() => lookup.poiId && void resolveHotspot(lookup.poiId)}>重试</button>}<button aria-label="取消地标查询" onClick={() => { lookupController.current?.abort(); lookupVersion.current += 1; setLookup(null); }}>关闭</button></div>}
    {anchor && p.selectedPlace && <PlacePopover anchor={anchor} onSize={onPopoverSize} loading={lookup?.id === p.selectedPlace.id && lookup.loading} error={lookup?.id === p.selectedPlace.id ? lookup.error : undefined} onRetry={() => p.selectedPlace && void resolvePlace(p.selectedPlace)} />}
    <div className="map-controls">
      <IconButton label={p.mapExpanded ? '恢复地图布局' : '展开地图'} aria-pressed={p.mapExpanded} onClick={() => p.setMapExpanded(!p.mapExpanded)}>{p.mapExpanded ? <Shrink size={19} /> : <Expand size={19} />}</IconButton>
      <IconButton label={p.currentCity ? `定位当前城市：${p.currentCity.name}` : '选择城市并定位'} onClick={p.locateCity}><LocateFixed size={21} /></IconButton>
      <div className="zoom-controls"><IconButton label="放大地图" onClick={() => map.current?.zoomIn()}><Plus size={22} /></IconButton><IconButton label="缩小地图" onClick={() => map.current?.zoomOut()}><Minus size={22} /></IconButton></div>
    </div>
    {tilesReady && <RouteLegend bottom={drawerHeight + 28} />}
  </div>;
}
