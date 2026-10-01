export const MAX_REFERENCE_BYTES = 100 * 1024;
export const MAX_REFERENCE_COUNT = 20;
export const MAX_SELECTED_REFERENCES = 8;
export const MAX_REFERENCE_CONTEXT = 12_000;
export type ReferenceInfo = { id: string; name: string; chars: number; createdAt: number };
export type TravelReference = ReferenceInfo & { text: string };
export type ReferenceExcerpt = { sourceId: string; name: string; chunk: number; text: string };

export function decodeReferenceFile(bytes: ArrayBuffer): string {
  if (bytes.byteLength > MAX_REFERENCE_BYTES) throw new Error('每份 TXT 最大 100 KB');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
}

/** Rank small excerpts inside the explicitly selected documents, with a bounded context. */
export function referenceExcerpts(documents: TravelReference[], queries: string[]): ReferenceExcerpt[] {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  const terms = [...new Set(queries.flatMap(q => [q.toLocaleLowerCase(), ...Array.from(segmenter.segment(q), part => part.segment.toLocaleLowerCase())]).filter(t => t.trim().length >= 2))];
  const ranked = documents.map(doc => {
    const chunks = doc.text.split(/\n\s*\n/).flatMap(paragraph => {
      const parts: string[] = [];
      for (let start = 0; start < paragraph.length; start += 700) parts.push(paragraph.slice(start, start + 800));
      return parts;
    }).filter(part => part.trim());
    return chunks.map((text, chunk) => ({ sourceId: doc.id, name: doc.name, chunk: chunk + 1, text, score: terms.reduce((n, term) => n + (text.toLocaleLowerCase().includes(term) ? Math.min(term.length, 12) : 0), 0) }))
      .filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.chunk - b.chunk).slice(0, 2);
  });
  const result: ReferenceExcerpt[] = []; let remaining = MAX_REFERENCE_CONTEXT;
  // Give every chosen document a first excerpt before adding a second one.
  for (let round = 0; round < 2; round++) for (const chunks of ranked) {
    const item = chunks[round]; if (!item || remaining <= 0) continue;
    const text = item.text.slice(0, remaining); remaining -= text.length;
    result.push({ sourceId: item.sourceId, name: item.name, chunk: item.chunk, text });
  }
  return result;
}
