'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ProgressiveDisclosure from './ProgressiveDisclosure';
import {
  exhibitAccept,
  exhibitKinds,
  exhibitModes,
  exhibitTitles,
  loadTemplateExhibits,
  removeTemplateExhibit,
  saveTemplateExhibit,
  type ExhibitKind,
  type TemplateExhibits
} from '../lib/template-exhibits';

type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
type Slot = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type NodeId = 'DISPUTE_LETTER' | 'LATE_LETTER' | ExhibitKind | null;
type Props = {
  round: Round;
  slots: Slot[];
  supportingReady: boolean;
  onUploadLetter: (slot: Slot, file: File) => Promise<void>;
  onRemoveLetter: (slot: Slot) => Promise<void>;
  onExhibitsChange: (value: TemplateExhibits) => void;
  onMessage: (message: string) => void;
};
function Badge({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <span className={`packet-status ${ready ? 'ready' : ''}`}>{children}</span>;
}
function kindDescription(kind: ExhibitKind) {
  return exhibitModes[kind] === 'GENERATED_DOCX'
    ? 'Editable DOCX · source-populated during generation'
    : 'Static PDF · merged unchanged in filing order';
}
function kindLabel(kind: ExhibitKind) {
  return exhibitModes[kind] === 'GENERATED_DOCX' ? 'Editable DOCX' : 'Static PDF';
}

export default function TemplatePacketConfigurator({ round, slots, supportingReady, onUploadLetter, onRemoveLetter, onExhibitsChange, onMessage }: Props) {
  const [open, setOpen] = useState<LetterType | null>('DISPUTE');
  const [activeNode, setActiveNode] = useState<NodeId>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [exhibits, setExhibits] = useState<TemplateExhibits>({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
  const dispute = slots.find((slot) => slot.type === 'DISPUTE')!;
  const late = slots.find((slot) => slot.type === 'LATE_PAYMENT')!;
  const disputeConfigured = useMemo(() => [Boolean(dispute.file), supportingReady, ...exhibitKinds.map((kind) => Boolean(exhibits[kind]))].filter(Boolean).length, [dispute.file, supportingReady, exhibits]);
  const requiredReady = Boolean(dispute.file);

  useEffect(() => {
    const saved = loadTemplateExhibits(round);
    setExhibits(saved);
    onExhibitsChange(saved);
    setOpen('DISPUTE');
    setActiveNode(null);
  }, [round]);

  async function uploadExhibit(kind: ExhibitKind, file: File) {
    try {
      const next = await saveTemplateExhibit(round, kind, file);
      setExhibits(next);
      onExhibitsChange(next);
      onMessage(`${exhibitTitles[kind]} saved for ${round}.`);
      setActiveNode(null);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'File could not be saved.');
    }
  }
  async function removeExhibit(kind: ExhibitKind) {
    const next = await removeTemplateExhibit(round, kind);
    setExhibits(next);
    onExhibitsChange(next);
    onMessage(`${exhibitTitles[kind]} removed from ${round}.`);
  }
  function configurePrimary() {
    setOpen('DISPUTE');
    setActiveNode(dispute.file ? null : 'DISPUTE_LETTER');
  }
  function setPacket(value: LetterType) {
    setOpen(open === value ? null : value);
    setActiveNode(null);
  }
  function LetterActions({ slot, node }: { slot: Slot; node: NodeId }) {
    const active = activeNode === node;
    return <div className={`contextual-actions studio-actions ${active ? 'visible' : ''}`}><button className="reveal-action" type="button" aria-expanded={active} onClick={() => setActiveNode(active ? null : node)}>{active ? 'Close' : slot.file ? 'Replace file' : 'Upload template'}</button><div className="contextual-action-region" aria-hidden={!active}><div><label><span>Select DOCX</span><input type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadLetter(slot, file).then(() => setActiveNode(null)); event.target.value = ''; }} /></label>{slot.file && <button className="remove-node" onClick={() => void onRemoveLetter(slot)}>Remove</button>}</div></div></div>;
  }
  function ExhibitActions({ kind }: { kind: ExhibitKind }) {
    const active = activeNode === kind;
    const format = exhibitModes[kind] === 'GENERATED_DOCX' ? 'DOCX' : 'PDF';
    return <div className={`contextual-actions studio-actions ${active ? 'visible' : ''}`}><button className="reveal-action" type="button" aria-expanded={active} onClick={() => setActiveNode(active ? null : kind)}>{active ? 'Close' : exhibits[kind] ? 'Replace file' : 'Upload file'}</button><div className="contextual-action-region" aria-hidden={!active}><div><label><span>Select {format}</span><input type="file" accept={exhibitAccept[kind]} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadExhibit(kind, file); event.target.value = ''; }} /></label>{exhibits[kind] && <button className="remove-node" onClick={() => void removeExhibit(kind)}>Remove</button>}</div></div></div>;
  }
  function ComponentCard({ number, title, meta, ready, status, format, children, className = '' }: { number: string; title: string; meta: string; ready: boolean; status: string; format: string; children?: ReactNode; className?: string }) {
    return <article className={`studio-component-card ${ready ? 'is-ready' : ''} ${className}`}><span className="studio-sequence">{number}</span><div className="studio-component-copy"><div className="studio-component-title"><h4>{title}</h4><span className="studio-format">{format}</span></div><p>{meta}</p></div><Badge ready={ready}>{status}</Badge>{children}</article>;
  }

  return <section className="template-studio template-studio-operational progressive-surface" aria-label="Packet template configuration">
    <section className="template-workflow-grid">
      <div className="template-primary-workflow">
        <header className="template-section-heading template-operational-heading">
          <div><p className="eyebrow">Primary workflow · {round}</p><h3>Dispute Packet Templates</h3><span>Configure reusable packet components in the same order used for final output.</span></div>
          <div className="template-heading-actions"><Badge ready={requiredReady}>{requiredReady ? `${disputeConfigured}/6 prepared` : 'Letter required'}</Badge><button type="button" className="template-primary-cta compact" onClick={configurePrimary}>{requiredReady ? 'Review packet' : 'Upload letter'}</button><button type="button" className="template-secondary-cta compact" onClick={() => setShowGuidance((value) => !value)}>{showGuidance ? 'Hide guide' : 'Guide'}</button></div>
        </header>
        <div className={`template-setup-guide operational ${showGuidance ? 'open' : ''}`} aria-hidden={!showGuidance}><div><div><strong>1. Letter</strong><span>Upload the required Dispute Letter DOCX.</span></div><div><strong>2. Inserts</strong><span>Add FCRA, Affidavit, Attachment and FTC templates.</span></div><div><strong>3. Evidence</strong><span>Supporting Documents are managed in Source Data.</span></div></div></div>
        <ProgressiveDisclosure open={open === 'DISPUTE'} onToggle={() => setPacket('DISPUTE')} title={dispute.name} summary="Standard order · Letter → Supporting → FCRA → Affidavit → Attachment → FTC" badge={<Badge ready={requiredReady}>{requiredReady ? 'Active' : 'Start here'}</Badge>} className="studio-packet-disclosure">
          <div className="studio-component-grid">
            <ComponentCard number="01" title="Dispute Letter" meta={dispute.file || 'Upload the DOCX letter template required to generate dispute packets.'} ready={Boolean(dispute.file)} status={dispute.file ? 'Ready' : 'Required'} format="Editable DOCX" className="primary-component"><LetterActions slot={dispute} node="DISPUTE_LETTER" /></ComponentCard>
            <ComponentCard number="02" title="Supporting Documents" meta="Client-specific evidence is uploaded and arranged in Source Data." ready={supportingReady} status={supportingReady ? 'Available' : 'Per client'} format="Image layout" className="linked-component" />
            {exhibitKinds.map((kind, index) => <ComponentCard key={kind} number={String(index + 3).padStart(2, '0')} title={exhibitTitles[kind]} meta={exhibits[kind]?.name || kindDescription(kind)} ready={Boolean(exhibits[kind])} status={exhibits[kind] ? 'Ready' : 'Optional'} format={kindLabel(kind)} className={exhibitModes[kind] === 'GENERATED_DOCX' ? 'editable-component' : 'static-component'}><ExhibitActions kind={kind} /></ComponentCard>)}
          </div>
        </ProgressiveDisclosure>
      </div>

      <aside className="template-secondary-workflow">
        <header className="template-section-heading"><div><p className="eyebrow">Conditional workflow</p><h3>Late Payment Packet</h3><span>Used only when late-payment records are detected.</span></div></header>
        <ProgressiveDisclosure open={open === 'LATE_PAYMENT'} onToggle={() => setPacket('LATE_PAYMENT')} title={late.name} summary="Letter → Supporting Documents" badge={<Badge ready={Boolean(late.file)}>{late.file ? 'Configured' : 'Optional'}</Badge>} className="studio-packet-disclosure secondary">
          <div className="studio-component-grid compact">
            <ComponentCard number="01" title="Late Payment Letter" meta={late.file || 'Configure only when your workflow handles late-payment disputes.'} ready={Boolean(late.file)} status={late.file ? 'Ready' : 'Optional'} format="Editable DOCX"><LetterActions slot={late} node="LATE_LETTER" /></ComponentCard>
            <ComponentCard number="02" title="Supporting Documents" meta="Uses the same client evidence page uploaded in Source Data." ready={supportingReady} status={supportingReady ? 'Available' : 'Per client'} format="Image layout" />
          </div>
        </ProgressiveDisclosure>
        <div className="template-rule-cards"><article><strong>Editable documents</strong><p>Letters, Affidavit and FTC are DOCX templates populated from source data.</p></article><article><strong>Static inserts</strong><p>FCRA and Attachment PDFs are merged unchanged into the final packet.</p></article></div>
      </aside>
    </section>
  </section>;
}
