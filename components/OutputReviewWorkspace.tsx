'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type ReviewOutput = { path: string; type: 'DISPUTE' | 'LATE_PAYMENT'; bureau: string; count: number; detail: string; blob: Blob };
type Filter = 'ALL' | 'DISPUTE' | 'LATE_PAYMENT';
type Props = { round: string; outputs: ReviewOutput[]; zipName?: string; warnings: string[]; onZip: () => void; onDownload: (output: ReviewOutput) => void; onReplace: (output: ReviewOutput, file: File) => void | Promise<void>; onRemove: (output: ReviewOutput) => void | Promise<void> };

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, onZip, onDownload, onReplace, onRemove }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selected, setSelected] = useState<ReviewOutput | null>(null);
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const dispute = outputs.filter((item) => item.type === 'DISPUTE').length;
  const late = outputs.filter((item) => item.type === 'LATE_PAYMENT').length;
  const visible = useMemo(() => filter === 'ALL' ? outputs : outputs.filter((item) => item.type === filter), [filter, outputs]);

  useEffect(() => {
    if (!selected || !host.current) return;
    const target = host.current;
    target.innerHTML = '';
    setError('');
    let active = true;
    void import('docx-preview').then(async ({ renderAsync }) => {
      if (!active) return;
      try {
        await renderAsync(await selected.blob.arrayBuffer(), target, undefined, { className: 'review-docx', inWrapper: true, breakPages: true, renderHeaders: true, renderFooters: true });
      } catch { if (active) setError('Preview unavailable. Download this DOCX to inspect it in your document editor.'); }
    }).catch(() => { if (active) setError('Document preview could not be loaded.'); });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => { if (selected && !outputs.some((item) => item.path === selected.path)) setSelected(null); }, [outputs, selected]);

  return <section className="outputs-workspace">
    <section className="panel package-overview">
      <header className="package-header"><div><p className="eyebrow">Delivery package</p><h2>{round} Letters</h2><p>Review output documents, then download one verified ZIP package.</p></div><span className="package-count">{outputs.length} DOCX</span></header>
      {zipName && <div className="package-delivery"><div><strong>{zipName}</strong><span>Generated DOCX files and decision manifest</span></div><button className="package-download" onClick={onZip}>Download ZIP Package <i>↓</i></button></div>}
      <div className="package-metrics"><button className={filter === 'ALL' ? 'selected' : ''} onClick={() => setFilter('ALL')}><small>All Outputs</small><strong>{outputs.length}</strong></button><button className={filter === 'DISPUTE' ? 'selected' : ''} onClick={() => setFilter('DISPUTE')}><small>Dispute Letters</small><strong>{dispute}</strong></button><button className={filter === 'LATE_PAYMENT' ? 'selected' : ''} onClick={() => setFilter('LATE_PAYMENT')}><small>Late Payment</small><strong>{late}</strong></button></div>
    </section>
    <section className="panel documents-library"><header className="library-header"><div><h2>Document Review</h2><p>Select a letter to inspect its rendered DOCX pages.</p></div><nav><button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>All</button><button className={filter === 'DISPUTE' ? 'active' : ''} onClick={() => setFilter('DISPUTE')}>Dispute</button><button className={filter === 'LATE_PAYMENT' ? 'active' : ''} onClick={() => setFilter('LATE_PAYMENT')}>Late Payment</button></nav></header>
      <div className="review-cards">{visible.map((output) => <article className="review-card" key={output.path}><div className="review-card-head"><span className={`doc-type ${output.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'}</span><span>{output.bureau}</span></div><h3>{output.path.split('/').pop()}</h3><p>{output.count} item block{output.count === 1 ? '' : 's'} · {output.detail}</p><div className="review-actions"><button onClick={() => setSelected(output)}>Review DOCX</button><button onClick={() => onDownload(output)}>Download</button></div></article>)}</div>
      {warnings.length > 0 && <div className="failed-output-list">{warnings.map((warning) => <article className="failed-output" key={warning}><strong>Not generated</strong><p>{warning}</p></article>)}</div>}
    </section>
    {selected && <div className="review-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="review-modal" role="dialog" aria-modal="true"><header><div><p className="eyebrow">Document review</p><h2>{selected.path.split('/').pop()}</h2><span>{selected.bureau} · {selected.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'}</span></div><button onClick={() => setSelected(null)} aria-label="Close review">×</button></header><div className="review-toolbar"><button onClick={() => onDownload(selected)}>Download DOCX</button><label>Replace Revised DOCX<input type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReplace(selected, file); event.target.value = ''; }} /></label><button className="remove" onClick={() => void onRemove(selected)}>Remove</button><p>For full format-preserving editing, download, edit in Word or LibreOffice, then replace the reviewed DOCX here.</p></div><div className="review-canvas">{error && <p className="preview-error">{error}</p>}<div className="docx-preview-host" ref={host} /></div></section></div>}
  </section>;
}
