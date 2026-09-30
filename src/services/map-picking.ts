import type { AMapEvent, AMapInstance } from './amap-sdk';
import type { Coordinate } from '@/lib/types';

export type MapPick = { type: 'poi'; id: string } | { type: 'point'; coordinate: Coordinate };
/** Hotspots and their companion map clicks share one pending single-click action. */
export function bindMapPicking(map: Pick<AMapInstance, 'on' | 'off'>, onPick: (pick: MapPick) => void) {
  let hoveredId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ignoreHotspotsUntil = 0;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const hotspotId = (event: AMapEvent) => typeof event.id === 'string' && /^[a-z\d]{1,64}$/i.test(event.id) ? event.id : undefined;
  const hotspot = (event: AMapEvent) => {
    const id = hotspotId(event);
    if (!id || Date.now() < ignoreHotspotsUntil) return;
    cancel();
    timer = setTimeout(() => { timer = undefined; onPick({ type: 'poi', id }); }, 350);
  };
  const doubleClick = (event: AMapEvent) => {
    cancel(); hoveredId = undefined;
    ignoreHotspotsUntil = Date.now() + 350;
    const point = event.lnglat;
    if (!point || !Number.isFinite(point.lng) || !Number.isFinite(point.lat) || Math.abs(point.lng) > 180 || Math.abs(point.lat) > 90) return;
    onPick({ type: 'point', coordinate: { lng: point.lng, lat: point.lat } });
  };
  const bindings: [string, (event: AMapEvent) => void][] = [
    ['hotspotover', event => { hoveredId = hotspotId(event); }],
    ['hotspotout', () => { hoveredId = undefined; }],
    ['hotspotclick', hotspot],
    // Some SDK builds expose the hotspot only through hover + ordinary click.
    ['click', () => { if (hoveredId) hotspot({ id: hoveredId }); }],
    ['dblclick', doubleClick],
    ['dragstart', () => { cancel(); hoveredId = undefined; }],
    ['zoomstart', () => { cancel(); hoveredId = undefined; }],
  ];
  bindings.forEach(([event, handler]) => map.on(event, handler));
  const cancelPick = () => { cancel(); hoveredId = undefined; };
  return {
    cancel: cancelPick,
    dispose: (detach = true) => { cancelPick(); if (detach) bindings.forEach(([event, handler]) => map.off(event, handler)); },
  };
}
