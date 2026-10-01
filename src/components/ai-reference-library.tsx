'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, Trash2, Upload } from 'lucide-react';
import { aiRequest as api } from '@/services/ai-request';
import { decodeReferenceFile, type ReferenceInfo, type TravelReference } from '@/lib/travel-references';

type Props = {
  planId: string; planName: string; references: ReferenceInfo[]; busy: boolean; loading: boolean;
  refresh: () => Promise<void>; perform: (work: () => Promise<void>) => Promise<void>; changed: () => void;
};
export function AIReferenceLibrary({ planId, planName, references, busy, loading, refresh, perform, changed }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<TravelReference | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const importFiles = (files: File[]) => perform(async () => {
    let added = 0; setNotice('');
    try {
      for (const file of files) {
        if (!alive.current) break;
        if (!/\.txt$/i.test(file.name)) throw new Error('请选择 TXT 文本文件');
        const text = decodeReferenceFile(await file.arrayBuffer());
        if (!alive.current) break;
        await api('references', { planId, name: file.name, text }); added++;
      }
    } finally {
      if (alive.current) { await refresh(); if (added) { changed(); setNotice(`已导入 ${added} 份攻略`); } }
    }
  });
  return <div className="ai-form">
    <div className="ai-library-heading"><div><h3>旅游攻略参考库</h3><p className="ai-note">{planName} · {references.length} / 20 份攻略</p></div><BookOpen size={25} /></div>
    <p className="ai-note">这个计划的攻略保存在本机。导入 TXT 后，前往“优化路线”勾选资料，助手会按地点名称提取相关段落。</p>
    <div className="ai-actions"><button disabled={busy || loading} onClick={() => input.current?.click()}><Upload size={16} />导入 TXT</button><span className="ai-note">每份 100 KB，支持 UTF-8 / GBK</span></div>
    <input hidden ref={input} type="file" accept=".txt,text/plain" multiple aria-label="导入攻略 TXT" onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; if (files.length) void importFiles(files); }} />
    {loading ? <p className="ai-note" role="status">正在读取本计划的攻略…</p> : !references.length ? <div className="ai-library-empty"><BookOpen size={30} /><strong>把旅途中用得上的攻略放进来</strong><span>支持景点笔记、游览顺序和交通经验。</span></div> : <ul className="ai-reference-list">
      {references.map(item => <li key={item.id}><FileText size={18} /><button className="ai-reference-title" disabled={busy} onClick={() => void perform(async () => { const next = await api(`references?${new URLSearchParams({ planId, id: item.id })}`); if (alive.current) { setView(next); setRemoving(null); } })}><strong>{item.name}</strong><small>{item.chars.toLocaleString()} 字</small></button>
        {removing === item.id ? <div className="ai-actions"><button className="danger" disabled={busy} onClick={() => void perform(async () => { await api('references', { planId, id: item.id }, 'DELETE'); if (alive.current) { if (view?.id === item.id) setView(null); setRemoving(null); await refresh(); changed(); setNotice('攻略已删除'); } })}>确认删除</button><button disabled={busy} onClick={() => setRemoving(null)}>取消</button></div> : <button disabled={busy} aria-label={`删除攻略：${item.name}`} onClick={() => setRemoving(item.id)}><Trash2 size={15} /></button>}
      </li>)}
    </ul>}
    {view && <section className="ai-reference-preview"><div className="ai-library-heading"><strong>{view.name}</strong><button onClick={() => setView(null)}>收起正文</button></div><pre>{view.text}</pre></section>}
    {notice && <p className="ai-note" role="status">{notice}</p>}
  </div>;
}
