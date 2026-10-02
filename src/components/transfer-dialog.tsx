'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  Copy,
  Sparkles,
} from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { parsePlannerData, serializePlannerData } from '@/lib/transfer';
import type { PlannerData } from '@/lib/types';
import { Modal } from './ui';
import { mapProvider, mapService } from '@/services/map-service';
import { batchMatchPlaces, repairGroups } from '@/lib/poi-repair';
import { mapFetch } from '@/services/map-request';
import { exportViewport, type ExportBasemap } from '@/lib/export-map';
import { colorImportedDays } from '@/lib/import-colors';
import { itineraryPrompt, modeLabels, scheduleLabel, structureItinerary } from '@/lib/itinerary-format';
import { aiRequest } from '@/services/ai-request';
import { MAX_AI_IMPORT_CHARS } from '@/lib/ai-import';
import { ScheduleNotes, ScheduleTime } from './schedule-editor';

export function TransferDialog({ onClose }: { onClose: () => void }) {
  const p = usePlanner();
  const currentSnapshot = JSON.stringify(p.data);
  const liveSnapshot = useRef(currentSnapshot); liveSnapshot.current = currentSnapshot;
  const [baseline, setBaseline] = useState(currentSnapshot);
  const stale = currentSnapshot !== baseline;
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [draft, setDraft] = useState(() => serializePlannerData(p.data));
  const [editing, setEditing] = useState(false),
    [source, setSource] = useState('当前行程');
  const [fileError, setFileError] = useState(''),
    [exportError, setExportError] = useState(''),
    [busy, setBusy] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [promptOpen, setPromptOpen] = useState(false), [copied, setCopied] = useState(false);
  const [aiBusy, setAiBusy] = useState(false), [aiError, setAiError] = useState('');
  const [matchBusy, setMatchBusy] = useState(false), [matchProgress, setMatchProgress] = useState('');
  const [candidate, setCandidate] = useState<{ data: PlannerData; warnings: string[]; original: string } | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => { if (stale) { generation.current++; controller.current?.abort(); setAiBusy(false); setMatchBusy(false); setCandidate(null); } }, [stale]);
  const changeDraft = (text: string) => {
    generation.current++; controller.current?.abort(); setAiBusy(false); setMatchBusy(false); setCandidate(null); setAiError(''); setDraft(text);
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(itineraryPrompt); setCopied(true); }
    catch { setPromptOpen(true); setCopied(false); p.setToast('请在展开的提示词中全选并复制'); }
  };
  const organize = async () => {
    if (stale || matchBusy) return;
    const expected = currentSnapshot;
    const id = ++generation.current;
    controller.current?.abort(); controller.current = new AbortController();
    setAiBusy(true); setAiError(''); setCandidate(null);
    try {
      const result = await aiRequest('import', { text: draft }, 'POST', AbortSignal.any([controller.current.signal, AbortSignal.timeout(60000)]));
      if (generation.current !== id || liveSnapshot.current !== expected) return;
      const checked = parsePlannerData(JSON.stringify(result.data));
      setCandidate({ data: checked.data, warnings: result.warnings, original: draft });
    } catch (e) { if (generation.current === id) setAiError(e instanceof Error ? e.message : 'AI 整理失败'); }
    finally { if (generation.current === id) setAiBusy(false); }
  };
  const parsed = useMemo(() => {
    try {
      const result = parsePlannerData(draft);
      const structured = structureItinerary(result.data);
      const reformatted = JSON.stringify(structured) !== JSON.stringify(result.data);
      const data = colorImportedDays(structured);
      const recolored = data.trip.days.some((day, index) => day.color !== result.data.trip.days[index].color || day.routes.some((route, r) => route.color !== result.data.trip.days[index].routes[r].color));
      return { data, warnings: [...result.warnings, ...(reformatted ? ['已将旧标题中的时间分开，完整原文保留在备注。'] : []), ...(recolored ? ['已为不同日期分配不同颜色，并同步当天路线颜色。'] : [])], error: '' };
    } catch (error) {
      return {
        data: null,
        warnings: [],
        error: error instanceof Error ? error.message : '数据读取失败',
      };
    }
  }, [draft]);
  const importMatched = async () => {
    if (!parsed.data || stale || matchBusy || mapProvider !== 'amap') return;
    const id = ++generation.current;
    setMatchBusy(true); setAiError(''); setMatchProgress('正在匹配地点…');
    try {
      const result = await batchMatchPlaces(parsed.data, (query, city) => mapService.searchPlace(query, city), () => generation.current === id && liveSnapshot.current === baseline, (done, total) => setMatchProgress(`正在匹配 ${done} / ${total}`));
      if (generation.current !== id || liveSnapshot.current !== baseline) return;
      p.importData(result.data);
      onClose();
      if (result.remaining) p.setRepairOpen(true);
      p.setToast(`已导入，匹配 ${result.matched} 个地点${result.remaining ? `，${result.remaining} 个待确认` : ''}${result.errors.length ? `（${result.errors.length} 项搜索失败，可重试）` : ''}，可撤销`);
    } catch (error) { if (generation.current === id) setAiError(error instanceof Error ? error.message : '地点匹配失败'); }
    finally { if (generation.current === id) setMatchBusy(false); }
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const id = ++generation.current;
    controller.current?.abort(); setAiBusy(false); setMatchBusy(false); setCandidate(null); setAiError('');
    setFileError('');
    if (file.size > 5_000_000) {
      setFileError('文件不能超过 5 MB。');
      return;
    }
    try {
      const text = await file.text();
      if (id !== generation.current) return;
      changeDraft(text); setOriginal(null);
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
      const data = p.data, results = p.routeResults;
      const name = safeFilename(data.trip.name);
      let basemap: string | ExportBasemap = '';
      if (kind !== 'json') {
        if (mapProvider === 'amap') {
          const viewport = exportViewport(data, results);
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
          new Blob([createRouteMapSvg(data, basemap, results)], { type: 'image/svg+xml;charset=utf-8' }),
          `${name}-路线图.svg`,
        );
      if (kind === 'png')
        downloadBlob(await createPlanningPng(data, basemap, results), `${name}-规划.png`);
      p.setToast('导出文件已生成');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请重试。');
    } finally {
      setBusy('');
    }
  };
  return (
    <Modal title="导入 / 导出" onClose={() => { generation.current++; controller.current?.abort(); onClose(); }} className="transfer-modal">
      <div className="transfer-tabs" role="tablist" aria-label="行程数据操作">
        <button role="tab" aria-selected={tab === 'import'} disabled={matchBusy} onClick={() => setTab('import')}>
          <Upload size={16} />
          导入行程
        </button>
        <button role="tab" aria-selected={tab === 'export'} disabled={matchBusy} onClick={() => setTab('export')}>
          <Download size={16} />
          导出行程
        </button>
      </div>
      <div className="import-prompt-card">
        <div><Sparkles size={17} /><span><strong>让 AI 生成可导入的行程</strong><small>复制完整格式、规则和示例，再补充你的旅行需求。</small></span></div>
        <div className="import-prompt-actions"><button className="text-button" onClick={() => setPromptOpen(!promptOpen)}>{promptOpen ? '收起规范' : '查看规范'}</button><button className="text-button" onClick={() => void copyPrompt()}><Copy size={14} />{copied ? '已复制' : '复制完整提示词'}</button></div>
        {promptOpen && <textarea className="prompt-copy-text" aria-label="完整 AI 行程提示词" readOnly value={itineraryPrompt} onFocus={e => e.target.select()} />}
      </div>
      {tab === 'export' && <p className="route-cost-summary">图片包含地图底图、所有行程地点和已就绪路线。高德模式导出时会加载完整行程范围的底图；未就绪路段不绘制。</p>}
      {tab === 'import' ? (
        <div key="import" role="tabpanel" aria-label="导入行程">
          {stale && <div className="transfer-warnings" role="alert"><p>当前行程已在其他窗口更新。为避免覆盖，请先核对最新行程；本次导入草稿仍保留。</p><button className="text-button" onClick={() => setBaseline(currentSnapshot)}>保留草稿，按最新行程继续</button></div>}
          <div className="transfer-toolbar">
            <span title={source}>{source}</span>
            <button className="text-button" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} />
              选择 JSON / TXT
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              aria-label="选择行程 JSON 文件"
              className="visually-hidden"
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          <div className="ai-import-toolbar"><div><strong>检查与整理导入内容</strong><p>直接校验在本机完成。点击 AI 整理会将本次输入发送给已配置的 AI 服务，结果先预览，再由你导入。</p></div><button className="ai-import-button" disabled={stale || aiBusy || matchBusy || !draft.trim() || draft.length > MAX_AI_IMPORT_CHARS} onClick={() => void organize()}>{aiBusy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{aiBusy ? '正在整理…' : 'AI 检查并整理'}</button></div>
          {draft.length > MAX_AI_IMPORT_CHARS && <p className="route-cost-summary">AI 整理上限 20,000 字符、80 个地点；仍可直接校验并导入 JSON。</p>}
          {aiError && <p className="transfer-error" role="alert">{aiError}</p>}
          {candidate && <section className="ai-import-candidate" aria-label="AI 整理结果"><div className="preview-heading"><strong>整理结果 · 待你确认</strong><span>{candidate.data.trip.days.reduce((n, d) => n + d.routes.reduce((v, r) => v + r.stops.length, 0), 0)} 个地点</span></div><ItineraryPreview data={candidate.data} /><div className="transfer-warnings">{candidate.warnings.map(w => <p key={w}>{w}</p>)}</div><div className="import-prompt-actions"><button className="text-button" onClick={() => setCandidate(null)}>保留原文</button><button className="primary-button" disabled={stale} onClick={() => { if (liveSnapshot.current !== baseline) return; setOriginal(candidate.original); changeDraft(serializePlannerData(candidate.data)); setEditing(false); setSource('AI 整理后的预览'); }}>采用到预览</button></div></section>}
          {original !== null && <button className="text-button restore-import" onClick={() => { changeDraft(original); setOriginal(null); setEditing(true); setSource('恢复的原始输入'); }}>恢复 AI 整理前的原文</button>}
          <div className="preview-heading">
            <span>{editing ? '导入原文 · JSON 或文字攻略' : '行程预览'}</span>
            <button onClick={() => setEditing(!editing)} disabled={editing && !!parsed.error}>
              <PencilLine size={13} />
              {editing ? '校验并预览' : '编辑 / 粘贴原文'}
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
                changeDraft(event.target.value);
                setFileError('');
              }}
            />
          ) : (
            <div
              className="import-preview-button"
            >
              {parsed.data && <ItineraryPreview data={parsed.data} />}
              <button className="preview-edit-hint" onClick={() => setEditing(true)} aria-label="行程预览，点击编辑 JSON 数据">
                <PencilLine size={12} />
                点击预览可编辑 JSON 或粘贴攻略
              </button>
            </div>
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
          {parsed.data && repairGroups(parsed.data).length > 0 && <p className="route-cost-summary">名称与详细地址分别匹配；明确匹配的地点直接加入，歧义项保留待确认。{mapProvider !== 'amap' ? '批量匹配需在地图设置中启用高德地图。' : ''}</p>}
          {matchBusy && <p role="status" className="route-cost-summary">{matchProgress}<button className="text-button" onClick={() => { generation.current++; setMatchBusy(false); }}>取消匹配</button></p>}
          <div className="transfer-footer">
            <span>
              <Check size={13} />
              导入后可撤销
            </span>
            <button
              className="primary-button"
              disabled={stale || !parsed.data || !!fileError || aiBusy || matchBusy || !!candidate}
              onClick={() => {
                if (parsed.data && liveSnapshot.current === baseline) {
                  p.importData(parsed.data);
                  onClose();
                }
              }}
            >
              <Upload size={15} />
              导入此行程
            </button>
            <button className="primary-button" disabled={stale || !parsed.data || !!fileError || aiBusy || matchBusy || !!candidate || mapProvider !== 'amap'} onClick={() => void importMatched()}>{matchBusy ? <LoaderCircle size={15} className="spin" /> : <Map size={15} />}一键匹配并导入</button>
          </div>
        </div>
      ) : (
        <div key="export" role="tabpanel" aria-label="导出行程">
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
  data = structureItinerary(data);
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
            <span>{day.date || '日期待定'}</span>
          </h4>
          <ScheduleTime value={day} />
          <ScheduleNotes notes={day.notes} />
          {day.routes.length ? (
            day.routes.map((route) => (
              <Fragment key={route.id}>
              <p>
                <strong>{route.name}</strong>
                <small>{scheduleLabel(route) || '时间待定'} · {modeLabels[route.mode]}</small>
                <span>{route.stops.map((stop) => stop.name).join(' → ') || '待安排地点'}</span>
              </p>
              <ScheduleNotes notes={route.notes} />
              {route.stops.length > 0 && <details className="preview-visit-details"><summary>查看地点、地址与时间</summary>{route.stops.map(s => <div key={s.id}><strong>{s.name}</strong><small>{s.address || '地址待补充'}</small><ScheduleTime value={s} /><ScheduleNotes notes={s.notes} /></div>)}</details>}
              </Fragment>
            ))
          ) : (
            <p className="preview-empty">自由安排</p>
          )}
        </div>
      ))}
    </div>
  );
}
