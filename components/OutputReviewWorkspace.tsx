'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { FinalPdfPacket } from './PdfPacketPreview';

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
  onReplace: (output: ReviewOutput, file: File) => void | Promise<void>;
};
function isLetter(output: ReviewOutput) { return !output.role || output.role === 'LETTER'; }
function packetTitle(output: ReviewOutput) { return `${output.bureau} ${output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'} Packet`; }
function packetDocuments(anchor: ReviewOutput, all: ReviewOutput[]) { return all.filter((output) => output.bureau === anchor.bureau && output.type === anchor.type).sort((a, b) => (a.sequence || 1) - (b.sequence || 1)); }

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, finalPackets = [], finalizing = false, finalZipName, onZip, onFinalZip, onFinalize, onPdfDownload, onReplace }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const packetAnchors = useMemo(() => outputs.filter(isLetter).sort((a, b) => a.bureau.localeCompare(b.bureau) || a.type.localeCompare(b.type)), [outputs]);
  const selected = packetAnchors.find((item) => item.path === selectedPath) || null;
  const selectedDocuments = selected ? packetDocuments(selected, outputs) : [];
  const notices = useMemo(() => Array.from(new Set(warnings)), [warnings]);
  return <section className="outputs-workspace">
    <section className="panel package-overview">
      <header className="package-header"><div><p className="eyebrow">Review and delivery</p><h2>{round} bureau packets</h2><p>Open one bureau packet at a time. Its letter, Affidavit and FTC documents belong to one standard ordered packet.</p></div><span className="package-count">{packetAnchors.length} PACKETS</span></header>
      <div className="packet-stage-strip" aria-label="Document workflow"><article className={outputs.length ? 'ready' : ''}><i>01</i><div><strong>Generated DOCX</strong><small>Packet components</small></div></article><span>→</span><article className={outputs.length ? 'active' : ''}><i>02</i><div><strong>Edit bureau packet</strong><small>One ordered workspace</small></div></article><span>→</span><article className={finalPackets.length ? 'ready' : ''}><i>03</i><div><strong>Download packet</strong><small>Final PDF on request</small></div></article></div>
      <div className="delivery-grid">{zipName && <div className="package-delivery"><div><strong>{zipName}</strong><span>All editable DOCX components and manifest</span></div><button className="package-download" onClick={onZip}>Download All DOCX <i>↓</i></button></div>}{onFinalize && <div className="finalize-delivery"><div><strong>Final PDF packets</strong><span>Generate only for final delivery</span></div><button className="finalize-pdf-button" disabled={finalizing || !outputs.length} onClick={() => void onFinalize()}>{finalizing ? 'Finalizing PDF packets...' : 'Create Final PDF Download'}</button></div>}</div>
    </section>
    {finalPackets.length > 0 && <section className="panel final-packet-library"><header className="library-header"><div><h2>Final PDF downloads</h2><p>Generated filing-order packets are ready for delivery.</p></div>{finalZipName && onFinalZip ? <button className="final-package-download" onClick={onFinalZip}>Download All Final PDFs</button> : <span className="package-count">{finalPackets.length} PDF</span>}</header><div className="final-packet-cards">{finalPackets.map((packet) => <article className="final-packet-card" key={packet.path}><span className={`doc-type ${packet.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{packet.type === 'DISPUTE' ? 'Dispute PDF' : 'Late Payment PDF'}</span><h3>{packet.path.split('/').pop()}</h3><ol>{packet.sequence.map((step) => <li key={step}>{step}</li>)}</ol>{onPdfDownload && <div><button onClick={() => onPdfDownload(packet)}>Download PDF</button></div>}</article>)}</div></section>}
    <section className="panel documents-library packet-library"><header className="library-header"><div><p className="eyebrow">Editable packet workspace</p><h2>Review packets by bureau</h2><p>Affidavit and FTC remain components of their matching Dispute Letter packet; they are not separate client packets.</p></div></header><div className="review-cards">{packetAnchors.map((packet) => { const components = packetDocuments(packet, outputs); return <article className="review-card packet-card" key={packet.path}><div className="review-card-head"><span className={`doc-type ${packet.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{packet.type === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</span><span>{packet.bureau}</span></div><p className="review-order">Standard filing order · {components.length} editable DOCX component{components.length === 1 ? '' : 's'}</p><h3>{packetTitle(packet)}</h3><p>{packet.type === 'DISPUTE' ? 'Dispute Letter → Supporting Documents → FCRA → Affidavit → Attachment → FTC' : 'Late Payment Letter → Supporting Documents'}</p><div className="review-actions"><button className="edit-document" onClick={() => setSelectedPath(packet.path)}>Open Packet Editor</button></div></article>; })}</div>{!packetAnchors.length && <div className="library-empty">No generated packets available.</div>}{notices.length > 0 && <div className="failed-output-list">{notices.map((warning, index) => <article className="failed-output" key={`warning-${index}`}><strong>Needs attention</strong><p>{warning}</p></article>)}</div>}</section>
    {selected && <SimpleDocxEditor round={round} output={selected} documents={selectedDocuments} onClose={() => setSelectedPath(null)} onSave={onReplace} />}
  </section>;
}
