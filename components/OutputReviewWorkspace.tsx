'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';

export type ReviewOutput = { path: string; type: 'DISPUTE' | 'LATE_PAYMENT'; bureau: string; count: number; detail: string; blob: Blob };
type Filter = 'ALL' | 'DISPUTE' | 'LATE_PAYMENT';
type Props = { round: string; outputs: ReviewOutput[]; zipName?: string; warnings: string[]; onZip: () => void; onDownload: (output: ReviewOutput) => void; onReplace: (output: ReviewOutput, file: File) => void | Promise<void>; onRemove: (output: ReviewOutput) => void | Promise<void> };

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, onZip, onReplace }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selected = outputs.find((item) => item.path === selectedPath) || null;
  const dispute = outputs.filter((item) => item.type === 'DISPUTE').length;
  const late = outputs.filter((item) => item.type === 'LATE_PAYMENT').length;
  const visible = useMemo(() => filter === 'ALL' ? outputs : outputs.filter((item) => item.type === filter), [filter, outputs]);
  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'ALL', label: 'All', count: outputs.length },
    { id: 'DISPUTE', label: 'Dispute', count: dispute },
    { id: 'LATE_PAYMENT', label: 'Late Payment', count: late }
  ];

  return <section className="outputs-workspace">
    <section className="panel package-overview">
      <header className="package-header"><div><p className="eyebrow">Delivery package</p><h2>{round} Letters</h2><p>Edit generated document text and basic formatting, then download one verified ZIP package.</p></div><span className="package-count">{outputs.length} DOCX</span></header>
      {zipName && <div className="package-delivery"><div><strong>{zipName}</strong><span>Generated DOCX files and decision manifest</span></div><button className="package-download" onClick={onZip}>Download ZIP Package <i>↓</i></button></div>}
    </section>
    <section className="panel documents-library">
      <header className="library-header"><div><h2>Document Editing</h2><p>Open a letter to correct its text, color, emphasis, alignment and paragraph spacing.</p></div></header>
      <nav className="document-filter-tabs" aria-label="Filter generated documents">
        {filters.map((item) => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}><span>{item.label}</span><strong>{item.count}</strong></button>)}
      </nav>
      <div className="review-cards">{visible.map((output) => <article className="review-card" key={output.path}><div className="review-card-head"><span className={`doc-type ${output.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'}</span><span>{output.bureau}</span></div><h3>{output.path.split('/').pop()}</h3><p>{output.count} item block{output.count === 1 ? '' : 's'} · {output.detail}</p><div className="review-actions"><button className="edit-document" onClick={() => setSelectedPath(output.path)}>Edit Document</button></div></article>)}</div>
      {!visible.length && <div className="library-empty">No documents in this category.</div>}
      {warnings.length > 0 && <div className="failed-output-list">{warnings.map((warning) => <article className="failed-output" key={warning}><strong>Not generated</strong><p>{warning}</p></article>)}</div>}
    </section>
    {selected && <SimpleDocxEditor output={selected} onClose={() => setSelectedPath(null)} onSave={onReplace} />}
  </section>;
}
