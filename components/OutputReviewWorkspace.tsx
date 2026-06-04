'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { FinalPdfPacket } from './PdfPacketPreview';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterType } from '../lib/letter-engine';
import { packetOrderText, packetPositionCount } from '../lib/workflow-framework';
import { runSharedTransition } from '../lib/shared-transition';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';
export type ReviewOutput = { id?: string; path: string; type: LetterType; role?: DocumentRole; sequence?: number; bureau: string; count: number; detail: string; blob: Blob; packetSteps?: string[] };
type Stage = 'REVIEW' | 'FINALIZE' | 'DELIVERY';
type Props = {
  round: string; outputs: ReviewOutput[]; zipName?: string; warnings: string[];
  finalPackets?: FinalPdfPacket[]; finalizing?: boolean; finalZipName?: string;
  evidenceKey?: string; evidence?: PacketAssets;
  onEvidenceChanged?: (assets: PacketAssets) => void; onMessage?: (message: string) => void;
  onZip: () => void; onFinalZip?: () => void; onFinalize?: () => void | Promise<void>;
  onPreviewPacket?: (output: ReviewOutput, pendingBlob: Blob) => Promise<FinalPdfPacket>;
  onPdfDownload?: (packet: FinalPdfPacket) => void; onReplace: (output: ReviewOutput, file: File) => void | Promise<void>;
};
function isLetter(output: ReviewOutput) { return !output.role || output.role === 'LETTER'; }
function roleOf(output: ReviewOutput): DocumentRole { return output.role || 'LETTER'; }
function packetTitle(output: ReviewOutput) { return `${output.bureau} ${output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'} Packet`; }
function documentTitle(output: ReviewOutput) { if (roleOf(output) === 'AFFIDAVIT') return 'Affidavit'; return output.type === 'DISPUTE' ? `${output.bureau} Dispute Letter` : `${output.bureau} Late Payment Letter`; }
function packetDocuments(anchor: ReviewOutput, all: ReviewOutput[]) { return all.filter((item) => item.type === anchor.type && (item.bureau === anchor.bureau || (anchor.type === 'DISPUTE' && item.role === 'AFFIDAVIT' && item.bureau === 'CLIENT'))).sort((a, b) => (a.sequence || 1) - (b.sequence || 1)); }
function Step({ active, done, number, label }: { active: boolean; done: boolean; number: string; label: string }) { return <span className={`output-flow-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}><b>{done ? '✓' : number}</b><small>{label}</small></span>; }
function Progress({ stage }: { stage: Stage }) { return <nav className="output-inline-progress" aria-label="Output delivery workflow"><Step number="01" label="Review" active={stage === 'REVIEW'} done={stage !== 'REVIEW'} /><Step number="02" label="Finalize" active={stage === 'FINALIZE'} done={stage === 'DELIVERY'} /><Step number="03" label="Download" active={stage === 'DELIVERY'} done={false} /></nav>; }
function OutputStageHeader({ stage, eyebrow, title, description, children }: { stage: Stage; eyebrow: string; title: string; description: string; children?: ReactNode }) { return <header className="output-stage-header output-progressive-command"><div className="output-stage-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div><div className="output-command-right"><Progress stage={stage} />{children}</div></header>; }

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, finalPackets = [], finalizing = false, finalZipName, evidenceKey = '', evidence, onEvidenceChanged, onMessage, onZip, onFinalZip, onFinalize, onPdfDownload, onReplace }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(finalPackets.length ? 'DELIVERY' : 'REVIEW');
  const [reviewed, setReviewed] = useState<string[]>([]);
  const activeOutputs = useMemo(() => outputs.filter((item) => item.role !== 'FTC'), [outputs]);
  const packets = useMemo(() => activeOutputs.filter(isLetter).sort((a, b) => a.bureau.localeCompare(b.bureau) || a.type.localeCompare(b.type)), [activeOutputs]);
  const docxDocuments = useMemo(() => [...activeOutputs].sort((a, b) => (a.sequence || 1) - (b.sequence || 1) || a.bureau.localeCompare(b.bureau)), [activeOutputs]);
  const selectedDocument = activeOutputs.find((item) => item.path === selectedPath) || null;
  const selectedPacket = selectedDocument ? (isLetter(selectedDocument) ? selectedDocument : packets.find((packet) => packet.type === selectedDocument.type) || null) : null;
  const documents = selectedPacket ? packetDocuments(selectedPacket, activeOutputs) : selectedDocument ? [selectedDocument] : [];
  const notices = useMemo(() => Array.from(new Set(warnings.filter((warning) => !/^FTC Report:/i.test(warning)))), [warnings]);
  const showStage = (next: Stage) => runSharedTransition(() => setStage(next), 'stage');
  useEffect(() => { if (finalPackets.length) runSharedTransition(() => setStage('DELIVERY'), 'stage'); }, [finalPackets.length]);
  useEffect(() => { setReviewed((items) => items.filter((path) => packets.some((packet) => packet.path === path))); }, [packets]);
  function markPacketReviewed(packet: ReviewOutput) { setReviewed((items) => items.includes(packet.path) ? items : [...items, packet.path]); }
  function openPacket(packet: ReviewOutput) { setSelectedPath(packet.path); markPacketReviewed(packet); }
  function openDocument(document: ReviewOutput) { setSelectedPath(document.path); const packet = isLetter(document) ? document : packets.find((item) => item.type === document.type); if (packet) markPacketReviewed(packet); }
  const reviewedCount = reviewed.length;
  return <section className="outputs-workspace guided-output-workspace progressive-output-workspace">
    {stage === 'REVIEW' && <section className="panel output-stage output-review-stage shared-stage-surface" style={{ viewTransitionName: 'output-work-stage' }}>
      <OutputStageHeader stage="REVIEW" eyebrow="Step 01 · Review" title="Review packets by bureau" description="Open each DOCX document directly or review the complete packet in filing order before finalization."><span className="output-count-pill">{reviewedCount}/{packets.length} reviewed</span></OutputStageHeader>
      <section className="output-docx-documents" aria-label="Editable DOCX documents"><header className="output-section-heading"><p className="eyebrow">Editable documents</p><h3>DOCX Documents</h3><p>Open any generated letter or affidavit in the simple editor.</p></header><div className="review-cards output-packet-grid">{docxDocuments.map((document) => <article className="review-card packet-card document-card" key={document.path}><header className="output-card-head"><span className="output-bureau">{document.bureau}</span><span className="packet-status ready">DOCX</span></header><h3>{documentTitle(document)}</h3><p className="output-card-order">{roleOf(document) === 'LETTER' ? 'Generated letter document' : 'Generated packet document'}</p><div className="output-card-meta"><span>Editable DOCX</span><span>Position {String(document.sequence || 1).padStart(2, '0')}</span></div><button type="button" className="edit-document" onClick={() => openDocument(document)}>Edit DOCX</button></article>)}</div></section>
      <section className="output-packet-review" aria-label="Packet review"><header className="output-section-heading"><p className="eyebrow">Ordered packets</p><h3>Packet Review</h3><p>Review each complete bureau packet and its shared documents in filing order.</p></header><div className="review-cards output-packet-grid">{packets.map((packet) => { const components = packetDocuments(packet, activeOutputs); const isReviewed = reviewed.includes(packet.path); return <article className={`review-card packet-card ${isReviewed ? 'reviewed' : ''}`} key={packet.path}><header className="output-card-head"><span className="output-bureau">{packet.bureau}</span><span className={`packet-status ${isReviewed ? 'ready' : 'neutral'}`}>{isReviewed ? 'Reviewed' : 'Ready to review'}</span></header><h3>{packetTitle(packet)}</h3><p className="output-card-order">{packetOrderText(packet.type)}</p><div className="output-card-meta"><span>{components.length} editable DOCX</span><span>{packetPositionCount(packet.type)} positions</span></div><button type="button" className="edit-document" onClick={() => openPacket(packet)}>{isReviewed ? 'Reopen Packet Editor' : 'Open Packet Editor'}</button></article>; })}</div></section>
      {notices.length > 0 && <div className="output-notices"><strong>Generation requires attention</strong>{notices.map((notice, index) => <p key={index}>{notice}</p>)}</div>}
      <footer className="output-stage-footer"><span>{reviewedCount < packets.length ? 'You may continue and return to edit documents before finalizing.' : 'All bureau packets have been opened for review.'}</span><button type="button" className="action-button" disabled={!packets.length} onClick={() => showStage('FINALIZE')}>Continue to Finalize</button></footer>
    </section>}
    {stage === 'FINALIZE' && <section className="panel output-stage output-finalize-stage shared-stage-surface" style={{ viewTransitionName: 'output-work-stage' }}>
      <OutputStageHeader stage="FINALIZE" eyebrow="Step 02 · Finalize" title="Finalize delivery" description={`Final PDFs follow the locked packet contract: ${packetOrderText('DISPUTE')}.`}><span className="output-count-pill">{packets.length} packets</span></OutputStageHeader>
      {notices.length > 0 && <div className="output-notices"><strong>Missing or failed generated documents</strong>{notices.map((notice, index) => <p key={index}>{notice}</p>)}</div>}
      <div className="output-finalize-grid">{zipName && <article className="output-delivery-option secondary"><div><span className="output-option-label">Working files</span><h3>Editable DOCX package</h3><p>Download source documents and manifest for additional offline edits.</p></div><button type="button" className="secondary-button" onClick={onZip}>Download DOCX ZIP</button></article>}<article className="output-delivery-option primary"><div><span className="output-option-label">Final delivery</span><h3>Ordered PDF packets</h3><p>Supporting Documents are merged into each final packet directly after its generated letter.</p></div><button type="button" className="action-button" disabled={finalizing || !activeOutputs.length || !onFinalize} onClick={() => void onFinalize?.()}>{finalizing ? 'Creating final PDFs…' : 'Create Final PDFs'}</button></article></div>
      <footer className="output-stage-footer"><button type="button" className="secondary-button" onClick={() => showStage('REVIEW')}>Back to Review</button></footer>
    </section>}
    {stage === 'DELIVERY' && <section className="panel output-stage output-delivery-stage shared-stage-surface" style={{ viewTransitionName: 'output-work-stage' }}><OutputStageHeader stage="DELIVERY" eyebrow="Step 03 · Download" title="Download final packets" description="Final filing-order PDF packets are ready for delivery.">{finalZipName && onFinalZip ? <button type="button" className="action-button output-download-all" onClick={onFinalZip}>Download All PDFs</button> : <span className="output-count-pill">{finalPackets.length} PDF</span>}</OutputStageHeader><div className="final-packet-cards output-final-cards">{finalPackets.map((packet) => <article className="final-packet-card" key={packet.path}><header><span className="packet-status ready">Ready</span><strong>{packet.bureau}</strong></header><h3>{packet.type === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</h3><p>{packetPositionCount(packet.type)} ordered positions</p>{onPdfDownload && <button type="button" className="secondary-button" onClick={() => onPdfDownload(packet)}>Download PDF</button>}</article>)}</div><footer className="output-stage-footer"><button type="button" className="secondary-button" onClick={() => showStage('REVIEW')}>Return to Review</button></footer></section>}
    {selectedPacket && selectedDocument && <SimpleDocxEditor round={round} output={selectedPacket} documents={documents} initialDocumentPath={selectedDocument.path} evidenceKey={evidenceKey} evidence={evidence} warnings={notices} onEvidenceChanged={onEvidenceChanged} onMessage={onMessage} onClose={() => setSelectedPath(null)} onSave={onReplace} />}
  </section>;
}
