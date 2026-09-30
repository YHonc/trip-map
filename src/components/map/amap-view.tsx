'use client';
import { useEffect, useRef, useState } from 'react';
import { Expand, Shrink, LocateFixed, Minus, Plus } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { dayStopOffset } from '@/lib/planner';
import { dayConnections } from '@/lib/connections';
import { isVerifiedPlace } from '@/lib/location';
import { loadAMap, lngLat, type AMapInstance, type AMapOverlay, type AMapSDK } from '@/services/amap-sdk';
import { mapProvider, mapService } from '@/services/map-service';
import { PlacePopover } from '../place-popover';
import { IconButton } from '../ui';

export function AMapView({ drawerHeight }: { drawerHeight: number }) {
  const p = usePlanner();
  const current = useRef(p); current.current = p;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<AMapInstance | null>(null);
  const [sdk, setSdk] = useState<AMapSDK | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<AMapOverlay[]>([]);
  useEffect(() => {
    let cancelled = false;
    let instance: AMapInstance | undefined;
    setError('');
    if (mapProvider !== 'amap') { setError('地图模式无效，请配置 mock 或 amap'); return; }
    void loadAMap().then(api => {
      if (cancelled || !container.current) return;
      instance = new api.Map(container.current, { zoom: 12, center: [121.4737, 31.2304], viewMode: '2D', resizeEnable: true });
      map.current = instance; setSdk(api);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : '地图加载失败'); });
    return () => { cancelled = true; instance?.destroy(); map.current = null; setSdk(null); };
  }, [attempt]);
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
      const overlay = new sdk.Marker({ position: lngLat(point), content: element, anchor: 'bottom-center', zIndex: selected ? 200 : 100 });
      overlay.on('click', click); overlays.push(overlay);
    };
    const planned = new Set<string>();
    p.mapDays.forEach(day => day.routes.filter(route => route.visible).forEach(route => {
      const result = p.routeResults[route.id];
      if (result?.status === 'ready' && result.geometry?.path.length) {
        for (const path of result.geometry.paths ?? [result.geometry.path]) {
          const line = new sdk.Polyline({ path: path.map(lngLat), strokeColor: day.color, strokeWeight: 4, strokeOpacity: p.selection.activeRouteId === route.id ? 1 : 0.55 });
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
    const update = () => { const point = instance.lngLatToContainer(lngLat(place)); setAnchor({ x: point.x, y: point.y - 44 }); };
    instance.setCenter(lngLat(place));
    // Leave room above the marker for details and below it for the favorites drawer.
    instance.panBy(0, Math.min(60, -drawerHeight / 2 + 110));
    update();
    instance.on('mapmove', update); instance.on('zoomchange', update); instance.on('resize', update);
    return () => { if (map.current === instance) { instance.off('mapmove', update); instance.off('zoomchange', update); instance.off('resize', update); } };
  }, [sdk, p.selectedPlace, drawerHeight]);
  const unresolved = p.data.trip.days.flatMap(day => day.routes.flatMap(route => route.stops)).filter(place => !isVerifiedPlace(place)).length;
  return <div className="map-view" data-testid="map-view">
    <div ref={container} className="amap-container" />
    {error ? <div className="map-provider-notice" role="alert">{error}<button onClick={() => setAttempt(n => n + 1)}>重试</button></div>
      : !sdk ? <div className="map-provider-notice">正在加载高德地图…</div>
      : unresolved > 0 && <div className="map-provider-notice">{unresolved} 个地点待确认<button onClick={() => p.setRepairOpen(true)}>搜索并批量确认</button></div>}
    {anchor && p.selectedPlace && <PlacePopover anchor={anchor} />}
    <div className="map-controls">
      <IconButton label={p.mapExpanded ? '恢复地图布局' : '展开地图'} aria-pressed={p.mapExpanded} onClick={() => p.setMapExpanded(!p.mapExpanded)}>{p.mapExpanded ? <Shrink size={19} /> : <Expand size={19} />}</IconButton>
      <IconButton label={p.currentCity ? `定位当前城市：${p.currentCity.name}` : '选择城市并定位'} onClick={p.locateCity}><LocateFixed size={21} /></IconButton>
      <div className="zoom-controls"><IconButton label="放大地图" onClick={() => map.current?.zoomIn()}><Plus size={22} /></IconButton><IconButton label="缩小地图" onClick={() => map.current?.zoomOut()}><Minus size={22} /></IconButton></div>
    </div>
    {sdk && <div className="amap-route-legend" style={{ bottom: drawerHeight + 28 }}>实线：高德道路 · 灰虚线：转场 · 棕虚线：非道路接驳（不计入路程）</div>}
  </div>;
}
