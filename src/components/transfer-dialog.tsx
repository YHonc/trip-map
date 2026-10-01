'use client';
import { useMemo, useRef, useState } from 'react';
import {
  Braces,
  Check,
  Download,
  FileImage,
  FileUp,
  LoaderCircle,
  Map,
  PencilLine,
  Upload,
} from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { parsePlannerData, serializePlannerData } from '@/lib/transfer';
import type { PlannerData } from '@/lib/types';
import { Modal } from './ui';
import { mapProvider } from '@/services/map-service';
import { mapFetch } from '@/services/map-request';
import { exportViewport, type ExportBasemap } from '@/lib/export-map';
import { colorImportedDays } from '@/lib/import-colors';

export function TransferDialog({ onClose }: { onClose: () => void }) {
  const p = usePlanner();
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [draft, setDraft] = useState(() => serializePlannerData(p.data));
  const [editing, setEditing] = useState(false),
    [source, setSource] = useState('当前行程');
  const [fileError, setFileError] = useState(''),
    [exportError, setExportError] = useState(''),
    [busy, setBusy] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => {
    try {
      const result = parsePlannerData(draft);
      const data = colorImportedDays(result.data);
      const recolored = data.trip.days.some((day, index) => day.color !== result.data.trip.days[index].color || day.routes.some((route, r) => route.color !== result.data.trip.days[index].routes[r].color));
      return { data, warnings: [...result.warnings, ...(recolored ? ['已为不同日期分配不同颜色，并同步当天路线颜色。'] : [])], error: '' };
    } catch (error) {
      return {
        data: null,
        warnings: [],
        error: error instanceof Error ? error.message : '数据读取失败',
      };
    }
  }, [draft]);
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError('');
    if (file.size > 5_000_000) {
      setFileError('文件不能超过 5 MB。');
      return;
    }
    try {
      const text = await file.text();
      setDraft(text);
      setSource(file.name);
      try {
        parsePlannerData(text);
        setEditing(false);
      } catch {
        setEditing(true);
      }
    } catch {
      setFileError('文件读取失败，请重新选择。');
    }
  };
  const exportFile = async (kind: 'json' | 'map' | 'png') => {
    setBusy(kind);
    setExportError('');
    try {
      const { createRouteMapSvg, createPlanningPng, downloadBlob, safeFilename } =
        await import('@/lib/export');
      const data = p.data, results = p.routeResults, transfers = p.transferResults;
      const name = safeFilename(data.trip.name);
      let basemap: string | ExportBasemap = '';
      if (kind !== 'json') {
        if (mapProvider === 'amap') {
          const viewport = exportViewport(data, results, transfers);
          const params = new URLSearchParams({ lng: String(viewport.center.lng), lat: String(viewport.center.lat), zoom: String(viewport.zoom) });
          const response = await mapFetch(`/api/amap/static-map?${params}`, { signal: AbortSignal.timeout(30000) });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || '底图加载失败，请重试');
          basemap = { ...viewport, dataUrl: payload.dataUrl };
        } else basemap = document.querySelector('.cartography')?.outerHTML ?? '';
      }
      if (kind === 'json')
        downloadBlob(
          new Blob([serializePlannerData(data)], { type: 'application/json;charset=utf-8' }),
          `${name}.json`,
        );
      if (kind === 'map')
        downloadBlob(
          new Blob([createRouteMapSvg(data, basemap, results, transfers)], { type: 'image/svg+xml;charset=utf-8' }),
          `${name}-路线图.svg`,
        );
      if (kind === 'png')
        downloadBlob(await createPlanningPng(data, basemap, results, transfers), `${name}-规划.png`);
      p.setToast('导出文件已生成');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请重试。');
    } finally {
      setBusy('');
    }
  };
  return (
    <Modal title="导入 / 导出" onClose={onClose} className="transfer-modal">
      <div className="transfer-tabs" role="tablist" aria-label="行程数据操作">
        <button role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>
          <Upload size={16} />
          导入行程
        </button>
        <button role="tab" aria-selected={tab === 'export'} onClick={() => setTab('export')}>
          <Download size={16} />
          导出行程
        </button>
      </div>
      {tab === 'export' && <p className="route-cost-summary">图片包含地图底图、所有行程地点和已就绪路线。高德模式导出时会加载完整行程范围的底图；未就绪路段不绘制。</p>}
      {tab === 'import' ? (
        <div role="tabpanel" aria-label="导入行程">
          <div className="transfer-toolbar">
            <span title={source}>{source}</span>
            <button className="text-button" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} />
              选择 JSON 文件
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              aria-label="选择行程 JSON 文件"
              className="visually-hidden"
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          <div className="preview-heading">
            <span>{editing ? 'JSON 数据编辑' : '行程预览'}</span>
            <button onClick={() => setEditing(!editing)} disabled={editing && !!parsed.error}>
              <PencilLine size={13} />
              {editing ? '查看预览' : '编辑 JSON'}
            </button>
          </div>
          {editing ? (
            <textarea
              autoFocus
              className="json-editor"
              aria-label="编辑 JSON 数据"
              value={draft}
              spellCheck={false}
              onChange={(event) => {
                setDraft(event.target.value);
                setFileError('');
              }}
            />
          ) : (
            <button
              className="import-preview-button"
              onClick={() => setEditing(true)}
              title="点击编辑 JSON 数据"
              aria-label="行程预览，点击编辑 JSON 数据"
            >
              {parsed.data && <ItineraryPreview data={parsed.data} />}
              <span className="preview-edit-hint">
                <PencilLine size={12} />
                点击预览可编辑 JSON 数据
              </span>
            </button>
          )}
          {(parsed.error || fileError) && (
            <p className="transfer-error" role="alert">
              {fileError || parsed.error}
            </p>
          )}
          {!!parsed.warnings.length && (
            <div className="transfer-warnings">
              {parsed.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
          <div className="transfer-footer">
            <span>
              <Check size={13} />
              导入后可撤销
            </span>
            <button
              className="primary-button"
              disabled={!parsed.data || !!fileError}
              onClick={() => {
                if (parsed.data) {
                  p.importData(parsed.data);
                  onClose();
                }
              }}
            >
              <Upload size={15} />
              导入此行程
            </button>
          </div>
        </div>
      ) : (
        <div role="tabpanel" aria-label="导出行程">
          <ItineraryPreview data={p.data} />
          <div className="export-options">
            <button disabled={!!busy} onClick={() => void exportFile('json')}>
              <span className="export-type-icon">
                <Braces size={22} />
              </span>
              <span>
                <strong>JSON 数据</strong>
                <small>完整行程与收藏，可再次导入编辑</small>
              </span>
              {busy === 'json' ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Download size={18} />
              )}
            </button>
            <button disabled={!!busy} onClick={() => void exportFile('map')}>
              <span className="export-type-icon">
                <Map size={22} />
              </span>
              <span>
                <strong>正常路线图</strong>
                <small>SVG · 内嵌底图与矢量路线、地点标记</small>
              </span>
              {busy === 'map' ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Download size={18} />
              )}
            </button>
            <button disabled={!!busy} onClick={() => void exportFile('png')}>
              <span className="export-type-icon">
                <FileImage size={22} />
              </span>
              <span>
                <strong>规划 PNG 图片</strong>
                <small>完整日期、地点清单和地图，方便查看与分享</small>
              </span>
              {busy === 'png' ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Download size={18} />
              )}
            </button>
          </div>
          {busy && busy !== 'json' && <p role="status" className="route-cost-summary">正在准备地图底图与导出图片…</p>}
          {exportError && (
            <p className="transfer-error" role="alert">
              {exportError}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
function ItineraryPreview({ data }: { data: PlannerData }) {
  return (
    <div className="itinerary-preview">
      <h3>{data.trip.name}</h3>
      <p className="preview-counts">
        {data.trip.days.length} 天 ·{' '}
        {data.trip.days.reduce((sum, day) => sum + day.routes.length, 0)} 条路线 ·{' '}
        {data.favorites.length} 个收藏
      </p>
      {!data.trip.days.length && <p className="preview-empty">还没有安排地点</p>}
      {data.trip.days.map((day) => (
        <div className="preview-day" key={day.id}>
          <h4>
            <i style={{ background: day.color }} />
            {day.name}
            <span>{day.date}</span>
          </h4>
          {day.routes.length ? (
            day.routes.map((route) => (
              <p key={route.id}>
                <strong>{route.name}</strong>
                <span>{route.stops.map((stop) => stop.name).join(' → ') || '待安排地点'}</span>
              </p>
            ))
          ) : (
            <p className="preview-empty">自由安排</p>
          )}
        </div>
      ))}
    </div>
  );
}
