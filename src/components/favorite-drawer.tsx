'use client';
import { useDraggable } from '@dnd-kit/core';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { GripVertical, MapPin, Star, Trash2 } from 'lucide-react';
import { Place } from '@/lib/types';
import { usePlanner } from '@/hooks/use-planner';
import { MoreMenu } from './ui';
const CLOSED = 64;
const COMPACT = 148;
const EXPANDED = 298;

export function FavoriteDrawer({ height, onHeightChange, dragging }: {
  height: number;
  onHeightChange: (height: number) => void;
  dragging: boolean;
}) {
  const p = usePlanner();
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; y: number; lastY: number; height: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const [resizing, setResizing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [maxHeight, setMaxHeight] = useState(EXPANDED);
  const scrollState = useRef({ direction: 1, position: 0, resumeAt: 0 });
  const open = height > CLOSED;
  const expanded = height > COMPACT + 40;
  const stops = [CLOSED, COMPACT, maxHeight];

  useEffect(() => {
    const area = root.current?.parentElement;
    if (!area) return;
    const observer = new ResizeObserver(() => {
      const max = Math.min(EXPANDED, Math.max(COMPACT, area.clientHeight - 240));
      setMaxHeight(max);
      if (height > max) onHeightChange(max);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [height, onHeightChange]);

  useEffect(() => {
    const element = list.current;
    if (!element || !open || hovered || focused || dragging || resizing) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previous = 0;
    const state = scrollState.current;
    state.position = element.scrollLeft;
    state.resumeAt = performance.now() + 1200;
    const tick = (now: number) => {
      const elapsed = previous ? Math.min(now - previous, 40) : 0;
      previous = now;
      const max = element.scrollWidth - element.clientWidth;
      if (!document.hidden && !reducedMotion.matches && now >= state.resumeAt && max > 1) {
        state.position = Math.max(0, Math.min(max, state.position + state.direction * elapsed * 0.022));
        element.scrollLeft = state.position;
        if (state.position >= max || state.position <= 0) {
          state.direction *= -1;
          state.resumeAt = now + 1400;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, expanded, hovered, focused, dragging, resizing, p.data.favorites.length]);

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    setResizing(false);
    if (current.moved) {
      suppressClick.current = true;
      const desired = Math.max(CLOSED, Math.min(maxHeight, current.height + current.y - event.clientY));
      const delta = current.y - event.clientY;
      const candidates = Math.abs(delta) > 24
        ? stops.filter((stop) => delta > 0 ? stop > current.height : stop < current.height)
        : stops;
      const nearest = (candidates.length ? candidates : stops).reduce((a, b) => Math.abs(a - desired) < Math.abs(b - desired) ? a : b);
      onHeightChange(cancelled ? current.height : nearest);
    }
    setDirection(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section ref={root} className={`favorite-drawer glass ${open ? 'expanded' : ''} ${resizing ? 'resizing' : ''}`}
      style={{ height }} aria-label="收藏地址篮" data-state={!open ? 'closed' : expanded ? 'expanded' : 'compact'}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}>
      <button className="drawer-grabber" aria-label="调整收藏栏高度" aria-expanded={open}
        aria-controls="favorite-list" title="向上或向下拖动，也可使用方向键"
        data-direction={direction ?? (expanded ? 'down' : 'up')}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          suppressClick.current = false;
          gesture.current = { id: event.pointerId, y: event.clientY, lastY: event.clientY, height, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.id !== event.pointerId) return;
          if (Math.abs(event.clientY - current.y) > 4) current.moved = true;
          if (!current.moved) return;
          setResizing(true);
          if (event.clientY !== current.lastY) setDirection(event.clientY < current.lastY ? 'up' : 'down');
          current.lastY = event.clientY;
          onHeightChange(Math.max(CLOSED, Math.min(maxHeight, current.height + current.y - event.clientY)));
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => finishDrag(event, true)}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          onHeightChange(!open ? COMPACT : expanded ? CLOSED : maxHeight);
        }}
        onKeyDown={(event) => {
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          onHeightChange(event.key === 'Home' ? CLOSED : event.key === 'End' ? maxHeight : event.key === 'ArrowUp'
            ? stops.find((stop) => stop > height + 1) ?? maxHeight
            : [...stops].reverse().find((stop) => stop < height - 1) ?? CLOSED);
        }}>
        <span className="drawer-grabber-shape" aria-hidden="true" />
      </button>
      <div className="drawer-heading">
        <Star className="favorite-star" size={23} fill="currentColor" />
        <strong>收藏地址</strong>
        <span className="favorite-count">{p.data.favorites.length}</span>
      </div>
        <div id="favorite-list" ref={list} className="favorite-list" inert={!open}
          aria-hidden={!open} aria-label="收藏地点" tabIndex={open ? 0 : -1}
          style={{ gridTemplateRows: `repeat(${Math.max(1, Math.floor((height - 80) / 68))}, 60px)` }}
          onWheel={(event) => {
            const element = event.currentTarget;
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) element.scrollLeft += event.deltaY;
          }}>
          {p.data.favorites.length ? (
            p.data.favorites.map((place) => <FavoritePlaceCard key={place.id} place={place} />)
          ) : (
            <div className="favorite-empty">
              <Star size={20} />
              <span>还没有收藏地点 · 搜索地点后点击「收藏」</span>
              <button onClick={() => p.setSearchFocus((v) => v + 1)}>去搜索</button>
            </div>
          )}
        </div>
    </section>
  );
}
function FavoritePlaceCard({ place }: { place: Place }) {
  const p = usePlanner();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `favorite-${place.id}`,
    data: { type: 'favorite', place },
  });
  return (
    <div
      ref={setNodeRef}
      className={`favorite-card ${isDragging ? 'drag-source' : ''}`}
      data-testid={`favorite-${place.id}`}
      onPointerDown={(event) => {
        if (!(event.target as Element).closest('.more-menu')) listeners?.onPointerDown?.(event);
      }}
      onClick={(event) => {
        if (!(event.target as Element).closest('.more-menu') && !isDragging)
          p.openPlace(place, 'favorite');
      }}
    >
      <button
        className="drag-handle"
        aria-label={`拖动收藏${place.name}`}
        {...attributes}
        onKeyDown={(event) => listeners?.onKeyDown?.(event)}
      >
        <GripVertical size={17} />
      </button>
      <button className="favorite-main" aria-label={`查看收藏${place.name}`}>
        <MapPin size={25} fill={place.color ?? '#237bff'} stroke="white" strokeWidth={1.5} />
        <strong>{place.name}</strong>
      </button>
      <MoreMenu label={`收藏${place.name}操作`}>
        <button onClick={() => p.setDestination({ drag: { type: 'favorite', place } })}>
          加入行程
        </button>
        <button className="danger" onClick={() => p.toggleFavorite(place)}>
          <Trash2 size={14} />
          取消收藏
        </button>
      </MoreMenu>
    </div>
  );
}
