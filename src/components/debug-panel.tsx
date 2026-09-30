'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Bug, Download, Trash2 } from 'lucide-react';
import { clearDebug, debugSnapshot, debugSubscribe, enableDebug, installDebugFetch } from '@/lib/debug';
import { Modal } from './ui';
export function DebugPanel() {
  const [open, setOpen] = useState(false), [enabled, setEnabled] = useState(false);
  const [exported, setExported] = useState('');
  const entries = useSyncExternalStore(debugSubscribe, debugSnapshot, debugSnapshot);
  useEffect(installDebugFetch, []);
  useEffect(() => { enableDebug(enabled); return () => enableDebug(false); }, [enabled]);
  const calls = entries.filter(entry => entry.call.startsWith('GET ') || entry.call.startsWith('POST '));
  const download = () => {
    const content = JSON.stringify({ scope: '当前浏览器调试记录，最多200条；不含地图SDK内部请求', entries }, null, 2);
    setExported(content);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'trip-map-debug.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <><button className={`debug-toggle ${enabled ? 'recording' : ''}`} onClick={() => setOpen(true)} aria-label="打开调试模式"><Bug size={17} />{enabled ? '调试中' : '调试'}</button>{open && createPortal(<Modal title="调用调试" onClose={() => setOpen(false)} className="debug-modal">
    <div className="debug-toolbar"><label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> 开启记录</label><button className="text-button" onClick={download}><Download size={15} />导出 JSON</button><button className="text-button" onClick={() => { clearDebug(); setExported(''); }}><Trash2 size={15} />清空</button></div>
    <p className="debug-note">仅记录开启后的本页调用，最多保留 200 条。关闭窗口仍会记录，取消勾选停止。参数仅保留地图搜索词、城市、坐标及交通方式；不记录 Key、请求头或 AI 内容。不含高德底图 SDK 内部请求。</p>
    <div className="debug-stats"><span>应用接口 <b>{calls.length}</b></span><span>高德上游 <b>{calls.reduce((sum, entry) => sum + (entry.upstream ?? 0), 0)}</b></span><span>本地复用 <b>{entries.length - calls.length}</b></span><span>失败 <b>{calls.filter(entry => !entry.status.includes('成功')).length}</b></span></div>
    {exported && <label className="form-label">导出内容（也可全选复制）<textarea aria-label="调试 JSON" readOnly value={exported} rows={8} /></label>}
    <div className="debug-entries">{!entries.length && <p>开启记录后，搜索地点或重新计算路线即可查看调用。</p>}{[...entries].reverse().map((entry, index) => <details key={`${entry.time}-${index}`}><summary><strong>{entry.call}</strong><span>{entry.status} · {entry.duration} ms</span></summary><small>{entry.time} · 高德上游：{entry.upstream ?? '未统计'} 次（0 表示未发出新上游请求）</small><pre>{JSON.stringify(entry.params, null, 2)}</pre></details>)}</div>
  </Modal>, document.body)}</>;
}
