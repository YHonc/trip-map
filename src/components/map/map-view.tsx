'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Expand, Shrink, LocateFixed, Minus, Plus } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { Coordinate, Day, Route, Stop } from '@/lib/types';
import { buildMockRoute, mapService, mapProvider } from '@/services/map-service';
import { AMapView } from './amap-view';
import { dayStopOffset } from '@/lib/planner';
import { dayConnections } from '@/lib/connections';
import { Cartography } from './cartography';
import { IconButton } from '../ui';
import { PlacePopover } from '../place-popover';
import {
  project,
  toScreen,
  viewportScale,
  minimumPan,
  type Camera,
  type Size,
} from '@/lib/map-geometry';
export function MapView({ drawerHeight }: { drawerHeight: number }) {
  return mapProvider === 'mock' ? <MockMapView drawerHeight={drawerHeight} /> : <AMapView drawerHeight={drawerHeight} />;
}
function MockMapView({ drawerHeight }: { drawerHeight: number }) {
  const p = usePlanner();
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 1200, height: 880 });
  const [popoverSize, setPopoverSize] = useState<Size>({ width: 282, height: 184 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const onPopoverSize = useCallback(
    (next: Size) =>
      setPopoverSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      ),
    [],
  );
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const isPlanned =
    p.selectedPlace &&
    p.data.trip.days.some((day) =>
      day.routes.some(
        (route) =>
          route.visible &&
          route.stops.some(
            (stop) => stop.id === p.selectedPlace!.id || stop.placeId === p.selectedPlace!.id,
          ),
      ),
    );
  const markerHeight = p.placeSource === 'searchResult' ? 49 : isPlanned ? 34 : 12;
  const anchorFor = (view: Camera) => {
    const position = toScreen(p.selectedPlace!, view, size);
    return {
      x: position.x,
      y: position.y - markerHeight * Math.sqrt(view.scale) * viewportScale(size) - 10,
    };
  };
  useLayoutEffect(() => {
    if (!p.selectedPlace || !container.current) return;
    const element = container.current;
    const area = element.getBoundingClientRect();
    const drawer = element.parentElement
      ?.querySelector('.favorite-drawer')
      ?.getBoundingClientRect();
    // Use the destination height, since the panel may still be animating there.
    const bottom = drawer ? size.height - (area.bottom - drawer.bottom) - drawerHeight - 12 : size.height - 14;
    const obstacles = ['.place-search', '.map-controls'].flatMap((selector) => {
      const rect = element.parentElement?.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? [
            {
              x: rect.left - area.left,
              y: selector === '.map-controls' ? size.height - drawerHeight - 44 - rect.height : rect.top - area.top,
              width: rect.width,
              height: rect.height,
            },
          ]
        : [];
    });
    const view = cameraRef.current,
      anchor = anchorFor(view),
      point = toScreen(p.selectedPlace, view, size);
    const delta = minimumPan(
      {
        x: anchor.x - popoverSize.width / 2,
        y: anchor.y - popoverSize.height,
        width: popoverSize.width,
        height: point.y + 12 - (anchor.y - popoverSize.height),
      },
      { x: 14, y: 14, width: size.width - 28, height: Math.max(200, bottom - 14) },
      obstacles,
    );
    if (Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5) {
      const scale = viewportScale(size);
      setCamera((prev) => ({ ...prev, x: prev.x + delta.x / scale, y: prev.y + delta.y / scale }));
    }
    // Only reveal on selection/layout changes; ordinary map panning must remain under user control.
  }, [p.selectedPlace, p.placeSource, size, popoverSize, drawerHeight, markerHeight]);
  const drag = useRef<{ x: number; y: number; camera: Camera; moved: boolean } | null>(null);
  useEffect(
    () =>
      mapService.subscribeViewport((command) => {
        if (command.type === 'pan') {
          const point = project(command.coordinate);
          setCamera((prev) => ({
            ...prev,
            x: 520 - point.x * prev.scale,
            y: 375 - point.y * prev.scale,
          }));
        } else if (!command.coordinates.length) setCamera({ x: 0, y: 0, scale: 1 });
        else {
          const points = command.coordinates.map(project);
          const minX = Math.min(...points.map((p) => p.x)),
            maxX = Math.max(...points.map((p) => p.x)),
            minY = Math.min(...points.map((p) => p.y)),
            maxY = Math.max(...points.map((p) => p.y));
          const scale = Math.min(
            1.65,
            870 / Math.max(400, maxX - minX),
            510 / Math.max(310, maxY - minY),
          );
          setCamera({
            scale,
            x: 550 - ((minX + maxX) / 2) * scale,
            y: 365 - ((minY + maxY) / 2) * scale,
          });
        }
      }),
    [],
  );
  const zoom = (factor: number) =>
    setCamera((prev) => {
      const scale = Math.max(0.65, Math.min(3.2, prev.scale * factor));
      const ratio = scale / prev.scale;
      return { scale, x: 600 - (600 - prev.x) * ratio, y: 400 - (400 - prev.y) * ratio };
    });
  const plannedIds = new Set(
    p.data.trip.days.flatMap((d) =>
      d.routes.filter((r) => r.visible).flatMap((r) => r.stops.map((s) => s.placeId)),
    ),
  );
  return (
    <div className="map-view" ref={container} data-testid="map-view">
      <svg
        className="map-canvas"
        viewBox="0 0 1200 880"
        preserveAspectRatio="xMidYMid slice"
        aria-label="上海行程地图，可拖动平移"
        onPointerDown={(e) => {
          if ((e.target as Element).closest('[data-map-interactive]')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, camera, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1200 / rect.width, 880 / rect.height);
          const dx = e.clientX - drag.current.x,
            dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
          setCamera({
            ...drag.current.camera,
            x: drag.current.camera.x + dx * ratio,
            y: drag.current.camera.y + dy * ratio,
          });
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) p.setSelectedPlace(null);
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => zoom(e.deltaY > 0 ? 0.94 : 1.06)}
      >
        <defs>
          <filter id="marker-shadow" x="-100%" y="-70%" width="300%" height="300%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#4b79b4" floodOpacity=".25" />
          </filter>
          <filter id="route-glow">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#428fff" floodOpacity=".17" />
          </filter>
        </defs>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
          <Cartography />
          {p.mapDays.flatMap(dayConnections).filter(c => c.enabled && c.visible).map(c => {
            const result = p.transferResults[c.id];
            if (result?.status !== 'ready' || !result.geometry) return null;
            return <polyline key={c.id} points={result.geometry.path.map(project).map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#8297b0" strokeWidth="2" strokeDasharray="6 5"><title>转场</title></polyline>;
          })}
          {p.mapDays.flatMap((day) => day.routes.filter((r) => r.visible).map((route) => ({ day, route })))
            .sort((a, b) => Number(a.route.id === p.selection.activeRouteId) - Number(b.route.id === p.selection.activeRouteId))
            .map(({ day, route }) => <RoutePolyline key={route.id} day={day} route={route} />)}
          {p.data.favorites
            .filter((f) => !plannedIds.has(f.id))
            .map((place) => {
              const point = project(place);
              return (
                <g
                  key={place.id}
                  data-map-interactive="true"
                  role="button"
                  tabIndex={0}
                  aria-label={`收藏地点 ${place.name}`}
                  transform={`translate(${point.x} ${point.y})`}
                  className="favorite-marker"
                  onClick={() => p.openPlace(place, 'favorite')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') p.openPlace(place, 'favorite');
                  }}
                >
                  <circle
                    r="10"
                    fill="white"
                    fillOpacity=".85"
                    stroke={place.color ?? '#7b95b7'}
                    strokeWidth="2"
                  />
                  <circle r="3" fill={place.color ?? '#7b95b7'} />
                </g>
              );
            })}
          {p.data.trip.days.flatMap((day) =>
            day.routes
              .filter((r) => r.visible)
              .flatMap((route) =>
                route.stops.map((stop, index) => (
                  <MapMarker
                    key={stop.id}
                    day={day}
                    route={route}
                    stop={stop}
                    index={dayStopOffset(day, route.id) + index}
                    scale={camera.scale}
                  />
                )),
              ),
          )}
          {p.selectedPlace && p.placeSource === 'searchResult' && (
            <SearchMarker coordinate={p.selectedPlace} scale={camera.scale} />
          )}
        </g>
      </svg>
      {p.selectedPlace && <PlacePopover anchor={anchorFor(camera)} onSize={onPopoverSize} />}
      <div className="map-controls">
        <IconButton label={p.mapExpanded ? '恢复地图布局' : '展开地图'} aria-pressed={p.mapExpanded} onClick={() => p.setMapExpanded(!p.mapExpanded)}>
          {p.mapExpanded ? <Shrink size={19} /> : <Expand size={19} />}
        </IconButton>
        <IconButton
          label="定位当前地点"
          onClick={() => {
            const coordinate =
              p.selectedPlace ??
              p.data.trip.days
                .find((d) => d.id === p.selection.activeDayId)
                ?.routes.flatMap((r) => r.stops)[0];
            if (coordinate) mapService.panTo(coordinate);
            else p.fitAllVisibleRoutes();
          }}
        >
          <LocateFixed size={21} />
        </IconButton>
        <div className="zoom-controls">
          <IconButton label="放大地图" onClick={() => zoom(1.2)}>
            <Plus size={22} />
          </IconButton>
          <IconButton label="缩小地图" onClick={() => zoom(1 / 1.2)}>
            <Minus size={22} />
          </IconButton>
        </div>
      </div>
      <div className="map-attribution">
        <span className="map-scale">{(500 / camera.scale).toFixed(0)} m</span>
        <span>上海 · 示意地图</span>
      </div>
    </div>
  );
}
function RoutePolyline({ day, route }: { day: Day; route: Route }) {
  const p = usePlanner();
  const result = p.routeResults[route.id];
  const fallback = useMemo(() => buildMockRoute(route.stops), [route.stops]);
  const geometry = result?.geometry ?? fallback;
  if (route.stops.length < 2) return null;
  const active = p.selection.activeRouteId === route.id;
  const dayActive = p.selection.activeDayId === day.id;
  const points = geometry.path
    .map(project)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
  const opacity = result?.status === 'loading' ? 0.35 : active ? 1 : dayActive ? 0.7 : 0.32;
  return (
    <g
      className="route-polyline"
      data-route-id={route.id}
      data-active={active}
      data-map-interactive="true"
      role="button"
      tabIndex={0}
      aria-label={`选择${day.name} ${route.name}`}
      onClick={() => p.selectRoute(day.id, route.id, false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') p.selectRoute(day.id, route.id, false);
      }}
    >
      <polyline points={points} fill="none" stroke="transparent" strokeWidth="22" />
      <polyline
        points={points}
        fill="none"
        stroke="white"
        strokeOpacity=".96"
        strokeWidth={active ? 8 : 6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke={day.color}
        strokeOpacity={opacity}
        strokeWidth={active ? 4.5 : 3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={active ? 'url(#route-glow)' : undefined}
      />
    </g>
  );
}
function MapMarker({
  day,
  route,
  stop,
  index,
  scale,
}: {
  day: Day;
  route: Route;
  stop: Stop;
  index: number;
  scale: number;
}) {
  const p = usePlanner();
  const point = project(stop);
  const selected = p.selection.activeStopId === stop.id;
  return (
    <g
      transform={`translate(${point.x} ${point.y}) scale(${1 / Math.sqrt(scale)})`}
      data-map-interactive="true"
      role="button"
      tabIndex={0}
      aria-label={`${day.name} ${index + 1} ${stop.name}`}
      className={`map-marker ${selected ? 'selected' : ''}`}
      onClick={() => p.openPlace(stop, 'planned', day.id, route.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          p.openPlace(stop, 'planned', day.id, route.id);
        }
      }}
    >
      {selected && <circle cy="-15" r="29" fill={day.color} opacity=".13" />}
      <ellipse cy="5" rx="9" ry="3" fill={day.color} opacity=".17" />
      <path d="M-5-3L0 8L5-3" fill={day.color} stroke="white" strokeWidth="2.5" />
      <circle
        cy="-15"
        r="17"
        fill={day.color}
        stroke="white"
        strokeWidth="3"
        filter="url(#marker-shadow)"
      />
      <circle cy="-17" r="13" fill="white" opacity=".06" />
      <text y="-9" textAnchor="middle" fill="white" fontSize="18" fontWeight="650">
        {index + 1}
      </text>
    </g>
  );
}
function SearchMarker({ coordinate, scale }: { coordinate: Coordinate; scale: number }) {
  const point = project(coordinate);
  return (
    <g transform={`translate(${point.x} ${point.y}) scale(${1 / Math.sqrt(scale)})`}>
      <circle r="32" fill="#237bff" opacity=".10" className="search-pulse" />
      <path
        d="M0 0C-30-30-20-49 0-49S30-30 0 0"
        fill="#237bff"
        stroke="white"
        strokeWidth="3"
        filter="url(#marker-shadow)"
      />
      <circle cy="-29" r="7" fill="white" />
    </g>
  );
}
