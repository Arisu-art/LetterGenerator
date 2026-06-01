'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
type Slot = { id: string; round: Round; type: 'DISPUTE' | 'LATE_PAYMENT'; name: string; file: string; size?: number };
type NodeId = 'DISPUTE_LETTER' | 'LATE_LETTER' | ExhibitKind | null;
type StatusTone = 'ready' | 'required' | 'neutral';
type Props = {
  round: Round;
  slots: Slot[];
  supportingReady: boolean;
  onUploadLetter: (slot: Slot, file: File) => Promise<void>;
  onRemoveLetter: (slot: Slot) => Promise<void>;
  onExhibitsChange: (value: TemplateExhibits) => void;
  onMessage: (message: string) => void;
};
function Badge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={`packet-status ${tone}`}>{children}</span>;
}
function Tag({ children }: { children: ReactNode }) {
  return <span className="template-info-tag">{children}</span>;
}
function kindDescription(kind: ExhibitKind) {
  return exhibitModes[kind] === 'GENERATED_DOCX' ? 'Populated from client source data' : 'Inserted unchanged in final packet';
}
function kindLabel(kind: ExhibitKind) {
  return exhibitModes[kind] === 'GENERATED_DOCX' ? 'Editable DOCX' : 'Static PDF';
}

export default function TemplatePacketConfigurator({ round, slots, supportingReady, onUploadLetter, onRemoveLetter, onExhibitsChange, onMessage }: Props) {
  const [lateOpen, setLateOpen] = useState(false);
  const [activeNode, setActiveNode] = useState<NodeId>(null);
  const [exhibits, setExhibits] = useState<TemplateExhibits>({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
  const dispute = slots.find((slot) => slot.type === 'DISPUTE')!;
  const late = slots.find((slot) => slot.type === 'LATE_PAYMENT')!;

  useEffect(() => {
    const saved = loadTemplateExhibits(round);
    setExhibits(saved);
    onExhibitsChange(saved);
    setLateOpen(false);
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
  function LetterActions({ slot, node }: { slot: Slot; node: NodeId }) {
    const active = activeNode === node;
    return <div className={`contextual-actions studio-actions ${active ? 'visible' : ''}`}><button className="reveal-action" type="button" aria-expanded={active} onClick={() => setActiveNode(active ? null : node)}>{active ? 'Close' : slot.file ? 'Replace' : 'Upload'}</button><div className="contextual-action-region" aria-hidden={!active}><div><label><span>Select DOCX</span><input type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadLetter(slot, file).then(() => setActiveNode(null)); event.target.value = ''; }} /></label>{slot.file && <button className="remove-node" onClick={() => void onRemoveLetter(slot)}>Remove</button>}</div></div></div>;
  }
  function ExhibitActions({ kind }: { kind: ExhibitKind }) {
    const active = activeNode === kind;
    const format = exhibitModes[kind] === 'GENERATED_DOCX' ? 'DOCX' : 'PDF';
    return <div className={`contextual-actions studio-actions ${active ? 'visible' : ''}`}><button className="reveal-action" type="button" aria-expanded={active} onClick={() => setActiveNode(active ? null : kind)}>{active ? 'Close' : exhibits[kind] ? 'Replace' : 'Upload'}</button><div className="contextual-action-region" aria-hidden={!active}><div><label><span>Select {format}</span><input type="file" accept={exhibitAccept[kind]} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadExhibit(kind, file); event.target.value = ''; }} /></label>{exhibits[kind] && <button className="remove-node" onClick={() => void removeExhibit(kind)}>Remove</button>}</div></div></div>;
  }
  function ComponentCard({ number, title, meta, tone, status, format, children, className = '' }: { number: string; title: string; meta: string; tone?: StatusTone; status: string; format: string; children?: ReactNode; className?: string }) {
    return <article className={`studio-component-card ${tone === 'ready' ? 'is-ready' : ''} ${className}`}><span className="studio-sequence">{number}</span><div className="studio-component-copy"><div className="studio-component-title"><h4>{title}</h4><span className="studio-format">{format}</span></div><p>{meta}</p></div><Badge tone={tone}>{status}</Badge>{children}</article>;
  }

  return <section className="template-studio template-studio-operational progressive-surface" aria-label="Packet template configuration">
    <section className="template-workflow-grid">
      <div className="template-primary-workflow">
        <header className="template-section-heading template-operational-heading">
          <div className="template-title-block"><p className="eyebrow">{round}</p><h3>Dispute Packet</h3><span>Letter → Supporting → FCRA → Affidavit → Attachment → FTC</span></div>
          <div className="template-info-tags" aria-label="Packet attributes"><Tag>Reusable</Tag><Tag>Order locked</Tag></div>
        </header>
        <div className="studio-component-grid primary-visible-grid">
          <ComponentCard number="01" title="Dispute Letter" meta={dispute.file || 'Upload the required dispute letter template.'} tone={dispute.file ? 'ready' : 'required'} status={dispute.file ? 'Ready' : 'Required'} format="Editable DOCX" className="primary-component"><LetterActions slot={dispute} node="DISPUTE_LETTER" /></ComponentCard>
          <ComponentCard number="02" title="Supporting Documents" meta="Client evidence is arranged in Source Data." tone={supportingReady ? 'ready' : 'neutral'} status={supportingReady ? 'Available' : 'Per client'} format="Image layout" className="linked-component" />
          {exhibitKinds.map((kind, index) => <ComponentCard key={kind} number={String(index + 3).padStart(2, '0')} title={exhibitTitles[kind]} meta={exhibits[kind]?.name || kindDescription(kind)} tone={exhibits[kind] ? 'ready' : 'neutral'} status={exhibits[kind] ? 'Ready' : 'Optional'} format={kindLabel(kind)} className={exhibitModes[kind] === 'GENERATED_DOCX' ? 'editable-component' : 'static-component'}><ExhibitActions kind={kind} /></ComponentCard>)}
        </div>
      </div>
      <aside className="template-secondary-workflow">
        <header className="template-section-heading"><div><p className="eyebrow">Optional</p><h3>Late Payment Packet</h3><span>Configure only for late-payment routes.</span></div></header>
        <ProgressiveDisclosure open={lateOpen} onToggle={() => { setLateOpen((value) => !value); setActiveNode(null); }} title={late.name} summary="Letter → Supporting Documents" badge={<Badge tone={late.file ? 'ready' : 'neutral'}>{late.file ? 'Ready' : 'Optional'}</Badge>} className="studio-packet-disclosure secondary">
          <div className="studio-component-grid compact">
            <ComponentCard number="01" title="Late Payment Letter" meta={late.file || 'Upload only when required.'} tone={late.file ? 'ready' : 'neutral'} status={late.file ? 'Ready' : 'Optional'} format="Editable DOCX"><LetterActions slot={late} node="LATE_LETTER" /></ComponentCard>
            <ComponentCard number="02" title="Supporting Documents" meta="Uses evidence from Source Data." tone={supportingReady ? 'ready' : 'neutral'} status={supportingReady ? 'Available' : 'Per client'} format="Image layout" />
          </div>
        </ProgressiveDisclosure>
      </aside>
    </section>
  </section>;
}
