'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import PdfPacketPreview, { type FinalPdfPacket } from './PdfPacketPreview';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';
export type ReviewOutput = {
  id?: string;
  path: string;
  type: 'DISPUTE' | 'LATE_PAYMENT';
  role?: DocumentRole;
  sequence?: number;
  bureau: string;
  count: number;
  detail: string;
  blob: Blob;
  packetSteps?: string[];
};
type Filter = 'ALL' | 'LETTERS' | 'AFFIDAVIT' | 'FTC';
type Props = {
  round: string;
  outputs: ReviewOutput[];
  zipName?: string;
  warnings: string[];
  finalPackets?: FinalPdfPacket[];
  finalizing?: boolean;
  finalZipName?: string;
  onZip: () => void;
  onFinalZip?: () => void;
  onFinalize?: () => void | Promise<void>;
  onPreviewPacket?: (output: ReviewOutput, pendingBlob: Blob) => Promise<FinalPdfPacket>;
  onPdfDownload?: (packet: FinalPdfPacket) => void;
  onDownload?: (output: ReviewOutput) => void;
  onReplace: (output: ReviewOutput, file: File) => void | Promise<void>;
  onRemove?: (output: ReviewOutput) => void | Promise<void>;
};
function roleLabel(output: ReviewOutput) {
  if (output.role === 'AFFIDAVIT') return 'Affidavit';
  if (output.role === 'FTC') return 'FTC Report';
  return output.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
}
function filterMatches(output: ReviewOutput, filter: Filter) {
  if (filter === 'ALL') return true;
  if (filter === 'LETTERS') return !output.role || output.role === 'LETTER';
  return output.role === filter;
}
function orderNote(output: ReviewOutput) {
  if (output.role === 'AFFIDAVIT') return 'Order 04 · Source-populated editable DOCX';
  if (output.role === 'FTC') return 'Order 06 · Source-populated editable DOCX';
  return output.type === 'DISPUTE' ? 'Order 01 · Dispute letter DOCX' : 'Order 01 · Late Payment letter DOCX';
}

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, finalPackets = [], finalizing = false, finalZipName, onZip, onFinalZip, onFinalize, onPreviewPacket, onPdfDownload, onReplace }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const selected = outputs.find((item) => item.path === selectedPath) || null;
  const pdf = finalPackets.find((item) => item.path === selectedPdf) || null;
  const letters = outputs.filter((item) => !item.role || item.role === 'LETTER').length;
  const affidavits = outputs.filter((item) => item.role === 'AFFIDAVIT').length;
  const ftcReports = outputs.filter((item) => item.role === 'FTC').length;
  const visible = useMemo(() => outputs.filter((item) => filterMatches(item, filter)).sort((a, b) => a.bureau.localeCompare(b.bureau) || (a.sequence || 1) - (b.sequence || 1)), [filter, outputs]);
  const displayedWarnings = useMemo(() => Array.from(new Set(warnings)), [warnings]);
  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'ALL', label: 'All editable documents', count: outputs.length },
    { id: 'LETTERS', label: 'Letters', count: letters },
    { id: 'AFFIDAVIT', label: 'Affidavits', count: affidavits },
    { id: 'FTC', label: 'FTC Reports', count: ftcReports }
  ];
  return <section className="outputs-workspace">
    <section className="panel package-overview">
      <header className="package-header"><div><p className="eyebrow">Review and finalization</p><h2>{round} document packets</h2><p>Edit generated DOCX files first. Open any document to preview its complete merged packet before download.</p></div><span className="package-count">{outputs.length} EDITABLE DOCX</span></header>
      <div className="packet-stage-strip" aria-label="Review workflow">
        <article className={outputs.length ? 'ready' : ''}><i>01</i><div><strong>Generated DOCX</strong><small>Letter, Affidavit and FTC</small></div></article>
        <span>→</span>
        <article className={outputs.length ? 'active' : ''}><i>02</i><div><strong>Inspect + preview</strong><small>Full ordered packet in editor</small></div></article>
        <span>→</span>
        <article className={finalPackets.length ? 'ready' : ''}><i>03</i><div><strong>Final PDF</strong><small>Download-ready package</small></div></article>
      </div>
      <div className="delivery-grid">
        {zipName && <div className="package-delivery"><div><strong>{zipName}</strong><span>Editable working files and manifest</span></div><button className="package-download" onClick={onZip}>Download Working ZIP <i>↓</i></button></div>}
        {onFinalize && <div className="finalize-delivery"><div><strong>Final merged PDF packets</strong><span>Letter → Supporting Documents → ordered Dispute inserts</span></div><button className="finalize-pdf-button" disabled={finalizing || !outputs.length} onClick={() => void onFinalize()}>{finalizing ? 'Finalizing PDF packets...' : 'Finalize PDF Packets'}</button></div>}
      </div>
    </section>
    {finalPackets.length > 0 && <section className="panel final-packet-library"><header className="library-header"><div><h2>Final PDF packets</h2><p>Review completed page order before delivering the filing-ready package.</p></div>{finalZipName && onFinalZip ? <button className="final-package-download" onClick={onFinalZip}>Download Final PDF ZIP</button> : <span className="package-count">{finalPackets.length} PDF</span>}</header><div className="final-packet-cards">{finalPackets.map((packet) => <article className="final-packet-card" key={packet.path}><span className={`doc-type ${packet.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{packet.type === 'DISPUTE' ? 'Dispute PDF' : 'Late Payment PDF'}</span><h3>{packet.path.split('/').pop()}</h3><ol>{packet.sequence.map((step) => <li key={step}>{step}</li>)}</ol><div><button onClick={() => setSelectedPdf(packet.path)}>Review PDF</button>{onPdfDownload && <button onClick={() => onPdfDownload(packet)}>Download</button>}</div></article>)}</div></section>}
    <section className="panel documents-library">
      <header className="library-header"><div><p className="eyebrow">Editable DOCX workspace</p><h2>Review every generated document</h2><p>Open Letters, Affidavits and FTC Reports. From the same editor, switch to Complete Packet Preview to see Supporting Documents and static PDF pages in order.</p></div></header>
      <nav className="document-filter-tabs" aria-label="Filter generated documents">{filters.map((item) => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}><span>{item.label}</span><strong>{item.count}</strong></button>)}</nav>
      <div className="review-cards">{visible.map((output) => <article className="review-card" key={output.path}><div className="review-card-head"><span className={`doc-type ${output.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{roleLabel(output)}</span><span>{output.bureau}</span></div><p className="review-order">{orderNote(output)}</p><h3>{output.path.split('/').pop()}</h3><p>{output.detail}</p><div className="review-actions"><button className="edit-document" onClick={() => setSelectedPath(output.path)}>Open, Edit and Preview</button></div></article>)}</div>
      {!visible.length && <div className="library-empty">No editable documents in this category.</div>}
      {displayedWarnings.length > 0 && <div className="failed-output-list">{displayedWarnings.map((warning, index) => <article className="failed-output" key={`warning-${index}`}><strong>Needs attention</strong><p>{warning}</p></article>)}</div>}
    </section>
    {selected && <SimpleDocxEditor output={selected} onClose={() => setSelectedPath(null)} onSave={onReplace} onPreviewPacket={onPreviewPacket} />}
    {pdf && <PdfPacketPreview packet={pdf} onClose={() => setSelectedPdf(null)} onDownload={(packet) => onPdfDownload?.(packet)} />}
  </section>;
}
