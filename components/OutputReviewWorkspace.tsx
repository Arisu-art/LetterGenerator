'use client';

import { useEffect, useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { FinalPdfPacket } from './PdfPacketPreview';
import type { PacketAssets } from '../lib/packet-assets';
import { runSharedTransition } from '../lib/shared-transition';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';
export type ReviewOutput = { id?: string; path: string; type: 'DISPUTE' | 'LATE_PAYMENT'; role?: DocumentRole; sequence?: number; bureau: string; count: number; detail: string; blob: Blob; packetSteps?: string[] };
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
function packetTitle(output: ReviewOutput) { return `${output.bureau} ${output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'} Packet`; }
function packetDocuments(anchor: ReviewOutput, all: ReviewOutput[]) { return all.filter((item) => item.bureau === anchor.bureau && item.type === anchor.type).sort((a, b) => (a.sequence || 1) - (b.sequence || 1)); }
function Step({ active, done, number, label }: { active: boolean; done: boolean; number: string; label: string }) { return <span className={`output-flow-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}><b>{done ? '✓' : number}</b><small>{label}</small></span>; }

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, finalPackets = [], finalizing = false, finalZipName, evidenceKey = '', evidence, onEvidenceChanged, onMessage, onZip, onFinalZip, onFinalize, onPdfDownload, onReplace }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(finalPackets.length ? 'DELIVERY' : 'REVIEW');
  const [reviewed, setReviewed] = useState<string[]>([]);
  const packets = useMemo(() => outputs.filter(isLetter).sort((a, b) => a.bureau.localeCompare(b.bureau) || a.type.localeCompare(b.type)), [outputs]);
  const selected = packets.find((item) => item.path === selectedPath) || null;
  const documents = selected ? packetDocuments(selected, outputs) : [];
  const notices = useMemo(() => Array.from(new Set(warnings)), [warnings]);
  const showStage = (next: Stage) => runSharedTransition(() => setStage(next), 'stage');
  useEffect(() => { if (finalPackets.length) runSharedTransition(() => setStage('DELIVERY'), 'stage'); }, [finalPackets.length]);
  useEffect(() => { setReviewed((items) => items.filter((path) => packets.some((packet) => packet.path === path))); }, [packets]);
  function openPacket(packet: ReviewOutput) { setSelectedPath(packet.path); setReviewed((items) => items.includes(packet.path) ? items : [...items, packet.path]); }
  const reviewedCount = reviewed.length;

  return <section className="outputs-workspace guided-output-workspace">
    <nav className="output-flow-progress" aria-label="Output delivery workflow">
      <Step number="01" label="Review packets" active={stage === 'REVIEW'} done={stage !== 'REVIEW'} />
      <Step number="02" label="Finalize delivery" active={stage === 'FINALIZE'} done={stage === 'DELIVERY'} />
      <Step number="03" label="Download PDFs" active={stage === 'DELIVERY'} done={false} />
    </nav>

    {stage === 'REVIEW' && <section className="panel output-stage output-review-stage shared-stage-surface" style={{ viewTransitionName: 'output-work-stage' }}>
      <header className="output-stage-header"><div><p className="eyebrow">Step 01</p><h2>Review packets by bureau</h2><p>Open each bureau packet to edit the Letter, Affidavit and FTC sections in filing order.</p></div><span className="output-count-pill">{reviewedCount}/{packets.length} reviewed</span></header>
      <div className="review-cards output-packet-grid">{packets.map((packet) => { const components = packetDocuments(packet, outputs); const isReviewed = reviewed.includes(packet.path); return <article className={`review-card packet-card ${isReviewed ? 'reviewed' : ''}`} key={packet.path}><header className="output-card-head"><span className="output-bureau">{packet.bureau}</span><span className={`packet-status ${isReviewed ? 'ready' : 'neutral'}`}>{isReviewed ? 'Reviewed' : 'Ready to review'}</span></header><h3>{packetTitle(packet)}</h3><p className="output-card-order">{packet.type === 'DISPUTE' ? 'Letter → Supporting → FCRA → Affidavit → Attachment → FTC' : 'Letter → Supporting Documents'}</p><div className="output-card-meta"><span>{components.length} editable DOCX</span><span>{packet.type === 'DISPUTE' ? '6 positions' : '2 positions'}</span></div><button className="edit-document" onClick={() => openPacket(packet)}>{isReviewed ? 'Reopen Editor' : 'Open Editor'}</button></article>; })}</div>
      {notices.length > 0 && <div className="output-notices"><strong>Blank positions retained</strong><p>{notices.length} item{notices.length === 1 ? '' : 's'} require attention before final delivery.</p></div>}
      <footer className="output-stage-footer"><span>{reviewedCount < packets.length ? 'You may continue and return to edit packets before finalizing.' : 'All bureau packets have been opened for review.'}</span><button className="action-button" disabled={!packets.length} onClick={() => showStage('FINALIZE')}>Continue to Finalize</button></footer>
    </section>}

    {stage === 'FINALIZE' && <section className="panel output-stage output-finalize-stage shared-stage-surface" style={{ viewTransitionName: 'output-work-stage' }}>
      <header className="output-stage-header"><div><p className="eyebrow">Step 02</p><h2>Finalize delivery</h2><p>Create final filing-order PDFs after completing document edits.</p></div><span className="output-count-pill">{packets.length} packets</span></header>
      <div className="output-finalize-grid">{zipName && <article className="output-delivery-option secondary"><div><span className="output-option-label">Working files</span><h3>Editable DOCX package</h3><p>Download source documents and manifest for additional offline edits.</p></div><button className="secondary-button" onClick={onZip}>Download DOCX ZIP</button></article>}<article className="output-delivery-option primary"><div><span className="output-option-label">Final delivery</span><h3>Ordered PDF packets</h3><p>Convert the reviewed bureau packets into final delivery PDFs.</p></div><button className="action-button" disabled={finalizing || !outputs.length || !onFinalize} onClick={() => void onFinalize?.()}>{finalizing ? 'Creating final PDFs...' : 'Create Final PDFs'}</button></article></div>
      <footer className="output-stage-footer"><button className="secondary-button" onClick={() => showStage('REVIEW')}>Back to Review</button></footer>
    </section>}

    {stage === 'DELIVERY' && <section className="panel output-stage output-delivery-stage shared-stage-surface" style={{ viewTransitionName: 'output-work-stage' }}>
      <header className="output-stage-header"><div><p className="eyebrow">Step 03</p><h2>Download final packets</h2><p>Final filing-order PDF packets are ready for delivery.</p></div>{finalZipName && onFinalZip ? <button className="action-button output-download-all" onClick={onFinalZip}>Download All PDFs</button> : <span className="output-count-pill">{finalPackets.length} PDF</span>}</header>
      <div className="final-packet-cards output-final-cards">{finalPackets.map((packet) => <article className="final-packet-card" key={packet.path}><header><span className="packet-status ready">Ready</span><strong>{packet.bureau}</strong></header><h3>{packet.type === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</h3><p>{packet.sequence.length} ordered positions</p>{onPdfDownload && <button className="secondary-button" onClick={() => onPdfDownload(packet)}>Download PDF</button>}</article>)}</div>
      <footer className="output-stage-footer"><button className="secondary-button" onClick={() => showStage('REVIEW')}>Return to Review</button></footer>
    </section>}

    {selected && <SimpleDocxEditor round={round} output={selected} documents={documents} evidenceKey={evidenceKey} evidence={evidence} onEvidenceChanged={onEvidenceChanged} onMessage={onMessage} onClose={() => setSelectedPath(null)} onSave={onReplace} />}
  </section>;
}
