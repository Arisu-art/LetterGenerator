'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import PdfPacketPreview, { type FinalPdfPacket } from './PdfPacketPreview';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';
export type ReviewOutput = {
  id: string;
  path: string;
  type: 'DISPUTE' | 'LATE_PAYMENT';
  role: DocumentRole;
  sequence: number;
  bureau: string;
  count: number;
  detail: string;
  blob: Blob;
};
type Filter = 'ALL' | 'DISPUTE' | 'LATE_PAYMENT';
type Props = {
  round: string;
  outputs: ReviewOutput[];
  zipName?: string;
  warnings: string[];
  finalPackets: FinalPdfPacket[];
  finalizing: boolean;
  onZip: () => void;
  onFinalize: () => void | Promise<void>;
  onPdfDownload: (packet: FinalPdfPacket) => void;
  onReplace: (output: ReviewOutput, file: File) => void | Promise<void>;
};
function roleLabel(role: DocumentRole) {
  if (role === 'AFFIDAVIT') return 'Affidavit';
  if (role === 'FTC') return 'FTC Report';
  return 'Letter';
}

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, finalPackets, finalizing, onZip, onFinalize, onPdfDownload, onReplace }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const selected = outputs.find((item) => item.id === selectedId) || null;
  const pdf = finalPackets.find((item) => item.path === selectedPdf) || null;
  const dispute = outputs.filter((item) => item.type === 'DISPUTE').length;
  const late = outputs.filter((item) => item.type === 'LATE_PAYMENT').length;
  const visible = useMemo(() => (filter === 'ALL' ? outputs : outputs.filter((item) => item.type === filter)).sort((a, b) => a.bureau.localeCompare(b.bureau) || a.sequence - b.sequence), [filter, outputs]);
  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'ALL', label: 'All editable documents', count: outputs.length },
    { id: 'DISPUTE', label: 'Dispute packet docs', count: dispute },
    { id: 'LATE_PAYMENT', label: 'Late Payment docs', count: late }
  ];
  return <section className="outputs-workspace">
    <section className="panel package-overview">
      <header className="package-header"><div><p className="eyebrow">Review and finalization</p><h2>{round} document packets</h2><p>Edit DOCX-generated content first. Then create one ordered final PDF packet per detected bureau letter.</p></div><span className="package-count">{outputs.length} EDITABLE DOCX</span></header>
      <div className="delivery-grid">
        {zipName && <div className="package-delivery"><div><strong>{zipName}</strong><span>Editable DOCX working package and generation manifest</span></div><button className="package-download" onClick={onZip}>Download Working ZIP <i>↓</i></button></div>}
        <div className="finalize-delivery"><div><strong>Final merged PDF packets</strong><span>Letter + supporting page + ordered dispute exhibits</span></div><button className="finalize-pdf-button" disabled={finalizing || !outputs.length} onClick={() => void onFinalize()}>{finalizing ? 'Finalizing PDF packets…' : 'Finalize PDF Packets'}</button></div>
      </div>
    </section>
    {finalPackets.length > 0 && <section className="panel final-packet-library"><header className="library-header"><div><h2>Final PDF packets</h2><p>Review the completed page order and download the filing-ready PDF output.</p></div><span className="package-count">{finalPackets.length} PDF</span></header><div className="final-packet-cards">{finalPackets.map((packet) => <article className="final-packet-card" key={packet.path}><span className={`doc-type ${packet.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{packet.type === 'DISPUTE' ? 'Dispute PDF' : 'Late Payment PDF'}</span><h3>{packet.path.split('/').pop()}</h3><ol>{packet.sequence.map((step) => <li key={step}>{step}</li>)}</ol><div><button onClick={() => setSelectedPdf(packet.path)}>Review PDF</button><button onClick={() => onPdfDownload(packet)}>Download</button></div></article>)}</div></section>}
    <section className="panel documents-library">
      <header className="library-header"><div><h2>Editable document review</h2><p>Inspect each generated letter, Affidavit and FTC DOCX before PDF finalization. Page boundaries are visible inside the editor.</p></div></header>
      <nav className="document-filter-tabs" aria-label="Filter generated documents">{filters.map((item) => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}><span>{item.label}</span><strong>{item.count}</strong></button>)}</nav>
      <div className="review-cards">{visible.map((output) => <article className="review-card" key={output.id}><div className="review-card-head"><span className={`doc-type ${output.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{roleLabel(output.role)}</span><span>{output.bureau} · {String(output.sequence).padStart(2, '0')}</span></div><h3>{output.path.split('/').pop()}</h3><p>{output.detail}</p><div className="review-actions"><button className="edit-document" onClick={() => setSelectedId(output.id)}>Open and Edit</button></div></article>)}</div>
      {!visible.length && <div className="library-empty">No editable documents in this category.</div>}
      {warnings.length > 0 && <div className="failed-output-list">{warnings.map((warning) => <article className="failed-output" key={warning}><strong>Needs attention</strong><p>{warning}</p></article>)}</div>}
    </section>
    {selected && <SimpleDocxEditor output={selected} onClose={() => setSelectedId(null)} onSave={onReplace} />}
    {pdf && <PdfPacketPreview packet={pdf} onClose={() => setSelectedPdf(null)} onDownload={onPdfDownload} />}
  </section>;
}
