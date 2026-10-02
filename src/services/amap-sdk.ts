import type { Coordinate } from '@/lib/types';
import { runtimeMapConfig } from './map-service';
export type AMapEvent = { lnglat?: { lng: number; lat: number }; name?: string; id?: string };
export interface AMapOverlay { on(event: string, fn: (event: AMapEvent) => void): void; }
export interface AMapInstance {
  add(overlays: AMapOverlay[]): void;
  remove(overlays: AMapOverlay[]): void;
  on(event: string, fn: (event: AMapEvent) => void): void;
  off(event: string, fn: (event: AMapEvent) => void): void;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  destroy(): void;
  setCenter(coordinate: number[], immediately?: boolean, duration?: number): void;
  setZoom(zoom: number): void;
  setFitView(overlays?: AMapOverlay[], immediately?: boolean, padding?: number[]): void;
  zoomIn(): void;
  zoomOut(): void;
  panBy(x: number, y: number): void;
  lngLatToContainer(coordinate: number[]): { x: number; y: number };
  containerToLngLat(pixel: unknown): { lng: number; lat: number };
}
export interface AMapSDK {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapInstance;
  Marker: new (options: Record<string, unknown>) => AMapOverlay;
  Polyline: new (options: Record<string, unknown>) => AMapOverlay;
  Pixel: new (x: number, y: number) => unknown;
}
declare global {
  interface Window { AMap?: AMapSDK; _AMapSecurityConfig?: { serviceHost: string }; }
}
let loading: Promise<AMapSDK> | undefined;
export function loadAMap(): Promise<AMapSDK> {
  if (loading) return loading;
  loading = (async () => {
    const key = runtimeMapConfig?.jsKey;
    if (!key) throw new Error('请在顶部“地图设置”中填写 JS API Key');
    const config = runtimeMapConfig!;
    if (!config.ready) throw new Error(`未配置 ${config.missing.join('、')}`);
    window._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
    if (window.AMap) return window.AMap;
    return new Promise<AMapSDK>((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); reject(new Error('高德地图加载超时')); }, 15_000);
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
      script.onload = () => {
        clearTimeout(timer);
        if (window.AMap) resolve(window.AMap);
        else reject(new Error('高德 SDK 未就绪，请检查 Key 与域名限制'));
      };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('高德 SDK 加载失败')); };
      document.head.appendChild(script);
    });
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
export const lngLat = (point: Coordinate) => [point.lng, point.lat];
