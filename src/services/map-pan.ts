import { lngLat, type AMapInstance, type AMapSDK } from './amap-sdk';
import type { Point } from '@/lib/map-geometry';

/** delta is the desired movement of the map contents, not of the camera. */
export function panMapContents(map: AMapInstance, sdk: AMapSDK, delta: Point, duration = 0) {
  const center = map.lngLatToContainer(lngLat(map.getCenter()));
  const target = map.containerToLngLat(new sdk.Pixel(center.x - delta.x, center.y - delta.y));
  map.setCenter(lngLat(target), duration === 0, duration);
}
