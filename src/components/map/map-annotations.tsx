'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Circle, Eraser, Hand, Pencil, Undo2, Check, Trash2 } from 'lucide-react';
import type { Coordinate } from '@/lib/types';
import type { Point } from '@/lib/map-geometry';
import { ANNOTATION_COLORS, MAX_ANNOTATIONS, MAX_ANNOTATION_POINTS, readAnnotations, saveAnnotations, type MapAnnotation } from '@/lib/map-annotations';
import { annotationAction, annotationHit, type AnnotationTool } from '@/lib/annotation-gesture';

type Gesture = { id: number; last: Point } & ({ kind: 'draw'; annotation: MapAnnotation } | { kind: 'pan' } | { kind: 'erase' });
type Props = {
  tripId: string; provider: 'mock' | 'amap';
  project: (coordinate: Coordinate) => Point;
  unproject: (point: Point) => Coordinate;
  viewRevision: string | number;
  onEditingChange?: (editing: boolean) => void;
  onPan: (delta: Point) => void;
  onZoom: (direction: number) => void;
};
export function MapAnnotations({ tripId, provider, project, unproject, viewRevision, onEditingChange, onPan, onZoom }: Props) {
  const [items, setItems] = useState<MapAnnotation[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>('pen');
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0]);
  const [draft, setDraft] = useState<MapAnnotation | null>(null);
  const [message, setMessage] = useState('');
  const gesture = useRef<Gesture | null>(null);
  const itemsRef = useRef(items);
  const editing = open;
  useEffect(() => { const saved = readAnnotations(tripId, provider); itemsRef.current = saved; setItems(saved); setReady(true); }, [tripId, provider]);
  useEffect(() => { onEditingChange?.(editing); return () => onEditingChange?.(false); }, [editing, onEditingChange]);
  const cancelStroke = () => { gesture.current = null; setDraft(null); };
  useEffect(() => { if (gesture.current?.kind === 'draw') cancelStroke(); }, [viewRevision]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) { cancelStroke(); setTool('pan'); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  const update = (next: MapAnnotation[]) => {
    itemsRef.current = next;
    setItems(next);
    setMessage(saveAnnotations(tripId, provider, next) ? '' : '无法保存到浏览器，批注仅本次有效');
  };
  const close = (clear: boolean) => {
    cancelStroke();
    const next = clear ? [] : itemsRef.current;
    itemsRef.current = next;
    setItems(next);
    if (!saveAnnotations(tripId, provider, next)) {
      setMessage(clear ? '清除未能保存，请检查浏览器存储后重试' : '无法保存到浏览器，请稍后重试');
      return;
    }
    setMessage(''); setOpen(false);
  };
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const down = (event: PointerEvent<SVGSVGElement>) => {
    const action = annotationAction(event.button, tool);
    if (!editing || !action || event.isPrimary === false || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    const point = position(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (action === 'pan' || action === 'erase') {
      gesture.current = { id: event.pointerId, last: point, kind: action };
      if (action === 'erase') erase(point, point);
      return;
    }
    if (itemsRef.current.length >= MAX_ANNOTATIONS) { setMessage('批注已达 80 条，请先擦除部分批注'); return; }
    const annotation: MapAnnotation = { id: crypto.randomUUID(), kind: action, color, points: [unproject(point)] };
    gesture.current = { id: event.pointerId, last: point, kind: 'draw', annotation };
    setDraft(annotation); setMessage('');
  };
  const erase = (from: Point, to: Point) => {
    const next = itemsRef.current.filter(item => !annotationHit(item, from, to, project));
    if (next.length !== itemsRef.current.length) update(next);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const point = position(event);
    if (active.kind === 'pan') { onPan({ x: point.x - active.last.x, y: point.y - active.last.y }); active.last = point; return; }
    if (active.kind === 'erase') { erase(active.last, point); active.last = point; return; }
    if (Math.hypot(point.x - active.last.x, point.y - active.last.y) < 2) return;
    const coordinate = unproject(point);
    let points = active.annotation.points;
    if (active.annotation.kind === 'ellipse') points = [points[0], coordinate];
    else if (points.length < MAX_ANNOTATION_POINTS) points = [...points, coordinate];
    else points = [...points.filter((_, index) => index % 2 === 0), coordinate];
    active.last = point;
    active.annotation = { ...active.annotation, points };
    setDraft(active.annotation);
  };
  const up = (event: PointerEvent<SVGSVGElement>) => {
    move(event);
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    cancelStroke();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.kind !== 'draw') return;
    const annotation = active.annotation;
    if (annotation.points.length < 2) return;
    if (annotation.kind === 'ellipse') {
      const a = project(annotation.points[0]), b = project(annotation.points[1]);
      if (Math.abs(a.x - b.x) < 6 || Math.abs(a.y - b.y) < 6) return;
    }
    update([...itemsRef.current, annotation]);
  };
  const draw = (annotation: MapAnnotation, temporary = false) => {
    const points = annotation.points.map(project);
    if (points.length < 2 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
    const shape = (hit: boolean) => annotation.kind === 'ellipse'
      ? <ellipse cx={(points[0].x + points[1].x) / 2} cy={(points[0].y + points[1].y) / 2} rx={Math.abs(points[1].x - points[0].x) / 2} ry={Math.abs(points[1].y - points[0].y) / 2} stroke={hit ? 'transparent' : annotation.color} strokeWidth={hit ? 18 : 3} />
      : <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} stroke={hit ? 'transparent' : annotation.color} strokeWidth={hit ? 18 : 3} />;
    return <g key={annotation.id} data-annotation-id={annotation.id} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={temporary ? .65 : .9} style={{ pointerEvents: 'none' }}>
      {shape(false)}
    </g>;
  };
  if (!ready) return null;
  return <>
    <svg className={`map-annotation-canvas ${editing ? 'is-editing' : ''} ${tool === 'erase' ? 'is-erasing' : ''} ${tool === 'pan' ? 'is-panning' : ''}`} aria-label="地图批注画布" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={event => { if (gesture.current?.id === event.pointerId) cancelStroke(); }} onLostPointerCapture={event => { if (gesture.current?.id === event.pointerId) cancelStroke(); }} onClick={event => { if (editing) event.stopPropagation(); }} onContextMenu={event => { if (editing) { event.preventDefault(); event.stopPropagation(); } }} onAuxClick={event => { if (editing) { event.preventDefault(); event.stopPropagation(); } }} onDoubleClick={event => { if (editing) { event.preventDefault(); event.stopPropagation(); } }} onWheel={event => { if (editing) { event.stopPropagation(); cancelStroke(); onZoom(event.deltaY); } }}>
      {items.map(item => draw(item))}{draft && draw(draft, true)}
    </svg>
    {open ? <aside className="annotation-panel" aria-label="地图批注工具">
      <div className="annotation-heading"><span><Pencil size={15} />地图批注</span><small>{items.length} 条</small></div>
      <div className="annotation-tools" role="toolbar" aria-label="批注工具">
        {([{ value: 'pen', label: '画线', Icon: Pencil }, { value: 'ellipse', label: '圈选', Icon: Circle }, { value: 'erase', label: '橡皮', Icon: Eraser }, { value: 'pan', label: '移动地图', Icon: Hand }] as const).map(({ value, label, Icon }) => <button key={value} title={label} aria-label={label} aria-pressed={tool === value} onClick={() => { cancelStroke(); setTool(value); }}><Icon size={17} /><span>{label === '移动地图' ? '移动' : label}</span></button>)}
      </div>
      <div className="annotation-options"><div className="annotation-colors" aria-label="批注颜色">{ANNOTATION_COLORS.map((value, index) => <button key={value} aria-label={['琥珀色', '玫瑰色', '鸢尾紫'][index]} aria-pressed={color === value} style={{ background: value }} onClick={() => setColor(value)}>{color === value && <Check size={12} />}</button>)}</div><button className="annotation-undo" disabled={!items.length} onClick={() => update(items.slice(0, -1))}><Undo2 size={14} />撤回一笔</button></div>
      <p className="annotation-hint" role="status">{message || ({ pen: '左键画线 · 右键拖动 · 中键擦除', ellipse: '左键圈选 · 右键拖动 · 中键擦除', erase: '左键擦除 · 右键拖动 · 中键擦除', pan: '左键拖动 · 右键拖动 · 中键擦除' })[tool]}</p>
      <div className="annotation-actions"><button className="annotation-keep" onClick={() => close(false)}><Check size={14} />保留并关闭</button><button onClick={() => close(true)}><Trash2 size={14} />清除并关闭</button></div>
    </aside> : <button className="annotation-launcher" aria-label="打开地图批注" onClick={() => { setOpen(true); setTool('pen'); }}><Pencil size={16} />批注{items.length > 0 && <span>{items.length}</span>}</button>}
  </>;
}
