'use client';
import { Heart, MapPin, Plus, X } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { IconButton } from './ui';
import { useLayoutEffect, useRef } from 'react';
import type { Point, Size } from '@/lib/map-geometry';
export function PlacePopover({ anchor, onSize, loading, error, onRetry }: { anchor: Point; onSize?: (size: Size) => void; loading?: boolean; error?: string; onRetry?: () => void }) {
  const p = usePlanner();
  const place = p.selectedPlace;
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      onSize?.({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onSize]);
  if (!place) return null;
  const id = 'placeId' in place ? String(place.placeId) : place.id;
  const favorite = p.data.favorites.some((f) => f.id === id);
  return (
    <section
      ref={ref}
      className="place-popover glass"
      aria-label="地点详情"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <div className="place-popover-top">
        <span className="place-type">
          <MapPin size={12} />
          {place.category}
        </span>
        <IconButton label="关闭地点详情" onClick={() => p.setSelectedPlace(null)}>
          <X size={15} />
        </IconButton>
      </div>
      <h2 title={place.name}>{place.name}</h2>
      <p className="place-address" title={place.address}>{place.address}</p>
      {place.locationSource === 'map-click' && !place.poiId && <small className="place-coordinates" aria-label="精确坐标">{place.lng.toFixed(6)}, {place.lat.toFixed(6)}</small>}
      {loading && <div className="place-lookup-status" role="status">正在查找详细地址…<div className="inline-progress" /></div>}
      {error && <div className="place-lookup-status" role="status">{error} · 可直接保存此坐标<button className="text-button" onClick={onRetry}>重试</button></div>}
      {place.provider === 'amap' && p.placeSource === 'searchResult' && p.selection.activeStopId && (
        <button className="text-button" onClick={() => p.confirmPlace(place)}>用此高德地点替换左栏选中地点</button>
      )}
      <div className="place-popover-actions">
        <button
          className={`secondary-button ${favorite ? 'is-favorite' : ''}`}
          onClick={() => p.toggleFavorite(place)}
        >
          <Heart size={14} fill={favorite ? 'currentColor' : 'none'} />
          {favorite ? '已收藏' : '收藏'}
        </button>
        <button
          className="primary-button"
          onClick={() => p.setDestination({ drag: { type: 'favorite', place } })}
        >
          <Plus size={14} />
          加入行程
        </button>
      </div>
      <div className="popover-tip" />
    </section>
  );
}
