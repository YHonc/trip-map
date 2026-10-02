'use client';
import { useEffect, useState, type RefObject } from 'react';
import type { Rect } from '@/lib/map-geometry';

const selectors = '.favorite-drawer, .place-search, .search-results, .map-controls, .annotation-panel, .annotation-launcher, .amap-route-legend, .route-legend-reopen, .map-provider-notice, .map-poi-status';
export function useMapLayout(root: RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState<{ bounds: Rect; obstacles: Rect[] }>({ bounds: { x: 14, y: 14, width: 800, height: 600 }, obstacles: [] });
  useEffect(() => {
    const element = root.current, area = element?.closest('.map-area');
    if (!element || !area) return;
    let timer: ReturnType<typeof setTimeout>;
    let previous = '';
    const observed = new Set<Element>();
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      const base = element.getBoundingClientRect();
      const nodes = [...area.querySelectorAll(selectors)];
      for (const node of nodes) if (!observed.has(node)) { resize.observe(node); observed.add(node); }
      for (const node of observed) if (node !== element && !nodes.includes(node)) { resize.unobserve(node); observed.delete(node); }
      const obstacles = nodes.flatMap(node => {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') return [];
        return [{ x: Math.round(rect.left - base.left), y: Math.round(rect.top - base.top), width: Math.ceil(rect.width), height: Math.ceil(rect.height) }];
      });
      const next = { bounds: { x: 14, y: 14, width: Math.max(0, base.width - 28), height: Math.max(0, base.height - 28) }, obstacles };
      const signature = JSON.stringify(next);
      if (signature !== previous) { previous = signature; setLayout(next); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(measure, 80); };
    const mutation = new MutationObserver(schedule);
    mutation.observe(area, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    resize.observe(element); observed.add(element); measure();
    return () => { clearTimeout(timer); mutation.disconnect(); resize.disconnect(); };
  }, [root]);
  return layout;
}
