'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, MapPin, Search, X } from 'lucide-react';
import { Place } from '@/lib/types';
import { usePlanner } from '@/hooks/use-planner';
import { mapService } from '@/services/map-service';
import { IconButton } from './ui';
export function PlaceSearch() {
  const p = usePlanner();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    setError('');
    setResults([]);
    setActiveIndex(-1);
    if (!query.trim()) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const values = await mapService.searchPlace(query, p.currentCity?.adcode);
        if (!cancelled) {
          setResults(values);
          setActiveIndex(-1);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '地点搜索失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, retry, p.currentCity?.adcode]);
  useEffect(() => {
    if (p.searchFocus) {
      input.current?.focus();
      setOpen(true);
    }
  }, [p.searchFocus]);
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);
  const select = (place: Place) => {
    p.openPlace(place, 'searchResult');
    setOpen(false);
    input.current?.blur();
  };
  return (
    <div className="place-search" ref={root}>
      <div className={`search-input-wrap glass ${open ? 'focused' : ''}`}>
        <Search size={21} strokeWidth={1.9} />
        <input
          ref={input}
          aria-label="搜索地点、地址、景区"
          placeholder={p.currentCity ? `在${p.currentCity.name}搜索地点…` : '搜索地点、地址、景区…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="place-results"
          aria-activedescendant={activeIndex >= 0 ? `result-${activeIndex}` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            }
            if (e.key === 'Enter' && !loading && !error && results.length) {
              e.preventDefault();
              select(results[Math.max(0, activeIndex)]);
            }
          }}
        />
        {loading ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          query && (
            <IconButton
              label="清空搜索"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
            >
              <X size={18} />
            </IconButton>
          )
        )}
        <button className="search-city-select" aria-label={`设置搜索城市：${p.currentCity?.name ?? '未选择'}`} onClick={() => {
          if (p.selection.activeDayId) p.setCityTarget({ dayId: p.selection.activeDayId, ...(p.selection.activeRouteId ? { routeId: p.selection.activeRouteId } : {}) });
          else p.setToast('请先添加一天，再设置旅游城市');
        }}><MapPin size={14} /><span>{p.currentCity?.name ?? '选择城市'}</span><ChevronDown size={13} /></button>
      </div>
      {open && (
        <div className="search-results glass" id="place-results" role="listbox">
          {loading ? (
            <div className="search-message">正在寻找好去处…</div>
          ) : error ? (
            <div className="search-message">
              {error}，<button onClick={() => setRetry((v) => v + 1)}>请重试</button>
            </div>
          ) : results.length ? (
            results.map((place, index) => (
              <button
                key={place.id}
                id={`result-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={`search-result ${activeIndex === index ? 'keyboard-active' : ''}`}
                onClick={() => select(place)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <MapPin size={19} />
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.address}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="search-message">
              {query.trim() ? '没有找到地点，试试「外滩」或「豫园」' : '搜索一个想去的地方，开始规划旅程'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
