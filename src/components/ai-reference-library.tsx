'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, FilePenLine, FileText, Trash2, Upload } from 'lucide-react';
import { aiRequest as api } from '@/services/ai-request';
import { decodeReferenceFile, MAX_REFERENCE_BYTES, MAX_REFERENCE_COUNT, type ReferenceInfo, type TravelReference } from '@/lib/travel-references';

type Props = {
  planId: string; planName: string; references: ReferenceInfo[]; busy: boolean; loading: boolean;
  refresh: () => Promise<void>; perform: (work: () => Promise<void>) => Promise<void>; changed: () => void;
  draft: { name: string; text: string; editing: boolean }; setDraft: (draft: Props['draft']) => void;
};
export function AIReferenceLibrary({ planId, planName, references, busy, loading, refresh, perform, changed, draft, setDraft }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<TravelReference | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const importing = useRef(false);
  const alive = useRef(true);
  const disabled = busy || loading || references.length >= MAX_REFERENCE_COUNT;
  const draftBytes = new TextEncoder().encode(draft.text).length;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const importFiles = async (files: File[]) => {
    if (!files.length || busy || loading || importing.current) return;
    importing.current = true;
    try { await perform(async () => {
    let added = 0; setNotice('');
    if (references.length + files.length > MAX_REFERENCE_COUNT) throw new Error(`每个计划最多 20 份攻略，还可添加 ${MAX_REFERENCE_COUNT - references.length} 份`);
    for (const file of files) {
      if (!/\.txt$/i.test(file.name)) throw new Error('请选择 TXT 文本文件');
      if (file.size > MAX_REFERENCE_BYTES) throw new Error('每份 TXT 最大 100 KB');
    }
    try {
      for (const file of files) {
        if (!alive.current) break;
        const text = decodeReferenceFile(await file.arrayBuffer());
        if (!alive.current) break;
        await api('references', { planId, name: file.name, text }); added++;
      }
    } finally {
      if (alive.current) { await refresh(); if (added) { changed(); setNotice(`已导入 ${added} 份攻略`); } }
    }
    }); } finally { importing.current = false; }
  };
  const startWriting = () => { if (!disabled) { setDraft({ ...draft, editing: true }); setNotice(''); } };
  return <div className={`ai-form ai-library${dragging ? ' is-dragging' : ''}`}
    onDragEnter={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current++; if (!disabled) setDragging(true); }}
    onDragOver={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
    onDragLeave={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
    onDrop={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current = 0; setDragging(false); void importFiles(Array.from(event.dataTransfer.files)); }}>
    <div className="ai-library-heading"><div><h3>旅游攻略参考库</h3><p className="ai-note">{planName} · {references.length} / 20 份攻略</p></div><BookOpen size={25} /></div>
    <p className="ai-note">直接输入或粘贴攻略，也可选择或拖入 TXT 文件。资料保存在本机，前往“优化路线”勾选后用于路线建议。</p>
    <div className="ai-actions"><button disabled={disabled} onClick={startWriting}><FilePenLine size={16} />直接输入文本</button><button disabled={disabled} onClick={() => input.current?.click()}><Upload size={16} />上传 TXT 文件</button><span className="ai-note">每份 100 KB，支持 UTF-8 / GBK</span></div>
    <input hidden ref={input} type="file" accept=".txt,text/plain" multiple aria-label="导入攻略 TXT" onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; if (files.length) void importFiles(files); }} />
    {draft.editing ? <section className="ai-reference-editor" aria-label="输入攻略">
      <label htmlFor="ai-reference-name">攻略名称<input id="ai-reference-name" autoFocus maxLength={160} disabled={busy} value={draft.name} placeholder="例如：天台一日游笔记" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label htmlFor="ai-reference-text">攻略正文<textarea id="ai-reference-text" rows={6} maxLength={MAX_REFERENCE_BYTES} disabled={busy} value={draft.text} placeholder="在这里输入或粘贴景点笔记、游览顺序、交通经验……" onChange={e => setDraft({ ...draft, text: e.target.value })} /></label>
      <div className="ai-prompt-meta"><span>也可以把 TXT 文件拖到这里，另存为一份攻略。</span><span className={draftBytes > MAX_REFERENCE_BYTES ? 'danger' : ''}>{(draftBytes / 1024).toFixed(1)} / 100 KB</span></div>
      <div className="ai-actions"><button className="ai-primary" disabled={disabled || !draft.text.trim() || draftBytes > MAX_REFERENCE_BYTES} onClick={() => void perform(async () => {
        await api('references', { planId, name: draft.name.trim() || '未命名攻略', text: draft.text });
        if (alive.current) { setDraft({ name: '', text: '', editing: false }); changed(); setNotice('攻略已保存'); await refresh(); }
      })}>保存攻略</button><button disabled={busy} onClick={() => setDraft({ ...draft, editing: false })}>收起草稿</button></div>
    </section> : <button className="ai-library-dropzone" disabled={disabled} onClick={startWriting}><BookOpen size={30} /><strong>{dragging ? '松开即可上传 TXT 文件' : '点击输入攻略，或将 TXT 文件拖到这里'}</strong><span>{draft.text || draft.name ? '有未保存的草稿，点击继续编辑' : '支持景点笔记、游览顺序和交通经验；可一次拖入多份文件。'}</span></button>}
    {dragging && <p className="ai-drop-notice" role="status">松开即可上传 TXT 文件</p>}
    {references.length >= MAX_REFERENCE_COUNT && <p className="ai-note">已达到 20 份上限，可删除不需要的攻略后再添加。</p>}
    {loading ? <p className="ai-note" role="status">正在读取本计划的攻略…</p> : references.length > 0 && <ul className="ai-reference-list">
      {references.map(item => <li key={item.id}><FileText size={18} /><button className="ai-reference-title" disabled={busy} onClick={() => void perform(async () => { const next = await api(`references?${new URLSearchParams({ planId, id: item.id })}`); if (alive.current) { setView(next); setRemoving(null); } })}><strong>{item.name}</strong><small>{item.chars.toLocaleString()} 字</small></button>
        {removing === item.id ? <div className="ai-actions"><button className="danger" disabled={busy} onClick={() => void perform(async () => { await api('references', { planId, id: item.id }, 'DELETE'); if (alive.current) { if (view?.id === item.id) setView(null); setRemoving(null); await refresh(); changed(); setNotice('攻略已删除'); } })}>确认删除</button><button disabled={busy} onClick={() => setRemoving(null)}>取消</button></div> : <button disabled={busy} aria-label={`删除攻略：${item.name}`} onClick={() => setRemoving(item.id)}><Trash2 size={15} /></button>}
      </li>)}
    </ul>}
    {view && <section className="ai-reference-preview"><div className="ai-library-heading"><strong>{view.name}</strong><button onClick={() => setView(null)}>收起正文</button></div><pre>{view.text}</pre></section>}
    {notice && <p className="ai-note" role="status">{notice}</p>}
  </div>;
}
