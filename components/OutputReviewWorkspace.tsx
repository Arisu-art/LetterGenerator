'use client';

import { useEffect, useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterRoute, LetterType } from '../lib/letter-engine';
import { assessRouteCoverage, type RouteCoverage } from '../lib/workflow-execution';
import { packetOrderText, packetPositionCount } from '../lib/workflow-framework';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';
export type ReviewOutput = { id?: string; path: string; type: LetterType; role?: DocumentRole; sequence?: number; bureau: string; count: number; detail: string; blob: Blob; packetSteps?: string[] };
type Props = {
  round: string; outputs: ReviewOutput[]; expectedRoutes?: LetterRoute[]; zipName?: string; warnings: string[];
  evidenceKey?: string; evidence?: PacketAssets; onEvidenceChanged?: (assets: PacketAssets) => void; onMessage?: (message: string) => void;
  onZip: () => void; onReplace: (output: ReviewOutput, file: File) => void | Promise<void>;
  finalPackets?: unknown[]; finalizing?: boolean; finalZipName?: string; onFinalZip?: () => void; onFinalize?: () => void | Promise<void>;
  onPreviewPacket?: (...args: any[]) => Promise<unknown>; onPdfDownload?: (...args: any[]) => void;
};
type PackageFile = { position: string; label: string; format: 'DOCX' | 'PDF'; supportingCount?: number };
function isLetter(output: ReviewOutput) { return !output.role || output.role === 'LETTER'; }
function roleOf(output: ReviewOutput): DocumentRole { return output.role || 'LETTER'; }
function titleOf(output: ReviewOutput) { return roleOf(output) === 'AFFIDAVIT' ? 'Affidavit' : `${output.bureau} ${output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'} Letter`; }
function packetTitle(output: ReviewOutput) { return `${output.bureau} ${output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'} Packet`; }
function packetDocuments(anchor: ReviewOutput, all: ReviewOutput[]) { return all.filter((item) => item.type === anchor.type && (item.bureau === anchor.bureau || (anchor.type === 'DISPUTE' && item.role === 'AFFIDAVIT' && item.bureau === 'CLIENT'))).sort((a, b) => (a.sequence || 1) - (b.sequence || 1)); }
function packageFiles(type: LetterType, supportingCount: number): PackageFile[] {
  if (type === 'DISPUTE') return [
    { position: '01', label: 'Dispute Letter', format: 'DOCX' },
    { position: '02', label: 'Supporting Documents', format: 'PDF', supportingCount },
    { position: '03', label: 'FCRA Legal Exhibit', format: 'PDF' },
    { position: '04', label: 'Affidavit', format: 'DOCX' },
    { position: '05', label: 'Attachment', format: 'PDF' }
  ];
  return [{ position: '01', label: 'Late Payment Letter', format: 'DOCX' }, { position: '02', label: 'Supporting Documents', format: 'PDF', supportingCount }];
}
function fallbackCoverage(packets: ReviewOutput[]): RouteCoverage { return { expected: packets.length, generated: packets.length, complete: packets.length > 0, routes: [], missing: [] }; }
function Coverage({ routes, outputs }: { routes: LetterRoute[]; outputs: ReviewOutput[] }) {
  const coverage = assessRouteCoverage(routes, outputs);
  return <section className={`execution-coverage-panel ${coverage.complete ? 'complete' : 'blocked'}`}>
    <header><div><p className="eyebrow">Execution integrity</p><h3>Required letters included</h3></div><strong>{coverage.generated}/{coverage.expected} generated</strong></header>
    <div className="execution-coverage-grid">{coverage.routes.map((route) => <article key={route.key} className={route.generated ? 'complete' : 'blocked'}><span>{route.bureau}</span><b>{route.label}</b><small>{route.generated ? 'Included in ordered package' : 'Missing generated letter'}</small></article>)}</div>
    {!coverage.complete && <p className="execution-coverage-blocker">Package download is blocked. Regenerate after resolving missing letter output.</p>}
  </section>;
}
export default function OutputReviewWorkspace({ round, outputs, expectedRoutes, zipName, warnings, evidenceKey = '', evidence, onEvidenceChanged, onMessage, onZip, onReplace }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const active = useMemo(() => outputs.filter((item) => item.role !== 'FTC'), [outputs]);
  const packets = useMemo(() => active.filter(isLetter).sort((a, b) => a.bureau.localeCompare(b.bureau) || a.type.localeCompare(b.type)), [active]);
  const planned = Boolean(expectedRoutes?.length);
  const coverage = useMemo(() => planned ? assessRouteCoverage(expectedRoutes || [], active) : fallbackCoverage(packets), [planned, expectedRoutes, active, packets]);
  const documents = useMemo(() => [...active].sort((a, b) => (a.sequence || 1) - (b.sequence || 1) || a.bureau.localeCompare(b.bureau)), [active]);
  const selected = active.find((item) => item.path === selectedPath) || null;
  const selectedPacket = selected ? (isLetter(selected) ? selected : packets.find((packet) => packet.type === selected.type) || null) : null;
  const selectedDocuments = selectedPacket ? packetDocuments(selectedPacket, active) : selected ? [selected] : [];
  const notices = useMemo(() => Array.from(new Set(warnings.filter((warning) => !/\bFTC\b|identity\s+theft\s+report/i.test(warning)))), [warnings]);
  const supportingCount = evidence?.supporting.length || 0;
  useEffect(() => setReviewed((value) => value.filter((path) => packets.some((packet) => packet.path === path))), [packets]);
  function openDocument(document: ReviewOutput) { setSelectedPath(document.path); const packet = isLetter(document) ? document : packets.find((item) => item.type === document.type); if (packet) setReviewed((value) => value.includes(packet.path) ? value : [...value, packet.path]); }
  return <section className="outputs-workspace guided-output-workspace progressive-output-workspace"><section className="panel output-stage output-review-stage shared-stage-surface">
    <header className="output-stage-header output-progressive-command"><div className="output-stage-heading"><p className="eyebrow">Review and delivery</p><h2>Complete ordered package</h2><p>Review editable documents and download the ordered component ZIP with supporting evidence and PDF inserts included.</p></div><span className={`output-count-pill ${coverage.complete ? '' : 'blocked'}`}>{coverage.generated}/{coverage.expected} generated</span></header>
    {planned && <Coverage routes={expectedRoutes || []} outputs={active} />}
    <section className="output-docx-documents"><header className="output-section-heading"><p className="eyebrow">Editable positions</p><h3>Generated DOCX Documents</h3><p>Saving an edit rebuilds the ordered component package.</p></header><div className="review-cards output-packet-grid">{documents.map((document) => <article className="review-card packet-card document-card" key={document.path}><header className="output-card-head"><span className="output-bureau">{document.bureau}</span><span className="packet-status ready">DOCX</span></header><h3>{titleOf(document)}</h3><p className="output-card-order">Editable packet component</p><div className="output-card-meta"><span>Editable DOCX</span><span>Position {String(document.sequence || 1).padStart(2, '0')}</span></div><button type="button" className="edit-document" onClick={() => openDocument(document)}>Edit DOCX</button></article>)}</div></section>
    <section className="output-packet-review"><header className="output-section-heading"><p className="eyebrow">Ordered folders</p><h3>Package Contents by Bureau</h3><p>Each folder contains the ordered DOCX and PDF components defined by the packet contract.</p></header><div className="review-cards output-packet-grid">{packets.map((packet) => <article className={`review-card packet-card component-package-card ${reviewed.includes(packet.path) ? 'reviewed' : ''}`} key={packet.path}><header className="output-card-head"><span className="output-bureau">{packet.bureau}</span><span className="packet-status ready">ZIP Folder</span></header><h3>{packetTitle(packet)}</h3><p className="output-card-order">{packetOrderText(packet.type)}</p><div className="package-file-list">{packageFiles(packet.type, supportingCount).map((file) => <div key={file.position}><b>{file.position}</b><strong>{file.label}</strong><small>{file.format}{file.supportingCount ? ` · ${file.supportingCount} file${file.supportingCount === 1 ? '' : 's'}` : ''}</small><span>Included</span></div>)}</div><button type="button" className="edit-document" onClick={() => openDocument(packet)}>Review Editable Documents</button></article>)}</div></section>
    {notices.length > 0 && <div className="output-notices"><strong>Package notice</strong>{notices.map((notice, index) => <p key={index}>{notice}</p>)}</div>}
    <section className="complete-package-delivery"><div><p className="eyebrow">Single archive delivery</p><h3>Download ordered packet package</h3><p>Includes letter DOCX, Supporting Documents PDF, FCRA PDF, Affidavit DOCX and Attachment PDF by bureau. FTC is excluded.</p></div><button type="button" className="action-button" disabled={!coverage.complete || !zipName} onClick={onZip}>Download Ordered Package ZIP</button></section>
    <footer className="output-stage-footer"><span>{coverage.complete ? `${reviewed.length}/${packets.length} bureau packets opened for DOCX review.` : 'Required letter output is missing; package download is blocked.'}</span></footer>
  </section>{selectedPacket && selected && <SimpleDocxEditor round={round} output={selectedPacket} documents={selectedDocuments} initialDocumentPath={selected.path} evidenceKey={evidenceKey} evidence={evidence} warnings={notices} onEvidenceChanged={onEvidenceChanged} onMessage={onMessage} onClose={() => setSelectedPath(null)} onSave={onReplace} />}</section>;
}
