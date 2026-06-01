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
function Arrow() { return <span className="packet-arrow" aria-hidden="true">↓</span>; }
function kindDescription(kind: ExhibitKind) {
  return exhibitModes[kind] === 'GENERATED_DOCX'
    ? 'Editable DOCX template · Filled from the TXT source during generation'
    : 'Static PDF · Merged unchanged into the filing-order packet';
}

export default function TemplatePacketConfigurator({ round, slots, supportingReady, onUploadLetter, onRemoveLetter, onExhibitsChange, onMessage }: Props) {
  const [open, setOpen] = useState<LetterType | null>(null);
  const [activeNode, setActiveNode] = useState<NodeId>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [exhibits, setExhibits] = useState<TemplateExhibits>({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
  const dispute = slots.find((slot) => slot.type === 'DISPUTE')!;
  const late = slots.find((slot) => slot.type === 'LATE_PAYMENT')!;
  useEffect(() => {
    const saved = loadTemplateExhibits(round);
    setExhibits(saved);
    onExhibitsChange(saved);
    setOpen(null);
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
    return <div className={`contextual-actions ${active ? 'visible' : ''}`}><button className="reveal-action" type="button" aria-expanded={active} onClick={() => setActiveNode(active ? null : node)}>{active ? 'Close' : slot.file ? 'Replace' : 'Configure'}</button><div className="contextual-action-region" aria-hidden={!active}><div><label><span>Upload DOCX</span><input type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadLetter(slot, file).then(() => setActiveNode(null)); event.target.value = ''; }} /></label>{slot.file && <button className="remove-node" onClick={() => void onRemoveLetter(slot)}>Remove</button>}</div></div></div>;
  }
  function ExhibitActions({ kind }: { kind: ExhibitKind }) {
    const active = activeNode === kind;
    const format = exhibitModes[kind] === 'GENERATED_DOCX' ? 'DOCX' : 'PDF';
    return <div className={`contextual-actions ${active ? 'visible' : ''}`}><button className="reveal-action" type="button" aria-expanded={active} onClick={() => setActiveNode(active ? null : kind)}>{active ? 'Close' : exhibits[kind] ? 'Replace' : 'Configure'}</button><div className="contextual-action-region" aria-hidden={!active}><div><label><span>Upload {format}</span><input type="file" accept={exhibitAccept[kind]} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadExhibit(kind, file); event.target.value = ''; }} /></label>{exhibits[kind] && <button className="remove-node" onClick={() => void removeExhibit(kind)}>Remove</button>}</div></div></div>;
  }
  function setPacket(value: LetterType) {
    setOpen(open === value ? null : value);
    setActiveNode(null);
  }
  return <section className="panel template-packet-config progressive-surface">
    <header className="packet-config-heading"><div><p className="eyebrow">Template architecture</p><h2>Document packet order</h2><p>Open only the packet you need. Configure actions appear at the exact component being changed, keeping the workspace focused.</p></div><button type="button" className={`guidance-toggle ${showGuidance ? 'active' : ''}`} onClick={() => setShowGuidance((value) => !value)}>{showGuidance ? 'Hide guide' : 'How templates work'}</button></header>
    <div className={`context-guide ${showGuidance ? 'open' : ''}`} aria-hidden={!showGuidance}><div><strong>Progressive configuration</strong><p>Choose a packet, then select Configure beside one component. Unconfigured inserts remain blank pages in the correct packet order until uploaded later. Supporting Documents are supplied with Source Data.</p></div></div>
    <ProgressiveDisclosure open={open === 'DISPUTE'} onToggle={() => setPacket('DISPUTE')} title={dispute.name} summary="Letter → Supporting → FCRA → Affidavit → Attachment → FTC" badge={<Badge ready={Boolean(dispute.file)}>{dispute.file ? 'Configured' : 'Needed'}</Badge>} className="packet-disclosure">
      <div className="packet-nodes">
        <div className="packet-node primary"><b>01</b><div><strong>Dispute Letter</strong><small>{dispute.file || 'Editable DOCX reference required'}</small></div><Badge ready={Boolean(dispute.file)}>{dispute.file ? 'DOCX saved' : 'Required'}</Badge><LetterActions slot={dispute} node="DISPUTE_LETTER" /></div>
        <Arrow />
        <div className="packet-node linked"><b>02</b><div><strong>Supporting Documents</strong><small>Client evidence page · uploaded in Source Data only when needed</small></div><Badge ready={supportingReady}>{supportingReady ? 'Available' : 'Later'}</Badge></div>
        {exhibitKinds.map((kind, index) => <div className="exhibit-flow" key={kind}><Arrow /><div className={`packet-node exhibit ${exhibitModes[kind] === 'GENERATED_DOCX' ? 'editable-node' : 'static-node'}`}><b>{String(index + 3).padStart(2, '0')}</b><div><strong>{exhibitTitles[kind]}</strong><small>{exhibits[kind]?.name || kindDescription(kind)}</small></div><Badge ready={Boolean(exhibits[kind])}>{exhibits[kind] ? exhibitModes[kind] === 'GENERATED_DOCX' ? 'DOCX saved' : 'PDF saved' : 'Blank until set'}</Badge><ExhibitActions kind={kind} /></div></div>)}
      </div>
    </ProgressiveDisclosure>
    <ProgressiveDisclosure open={open === 'LATE_PAYMENT'} onToggle={() => setPacket('LATE_PAYMENT')} title={late.name} summary="Letter → Supporting Documents" badge={<Badge ready={Boolean(late.file)}>{late.file ? 'Configured' : 'Optional'}</Badge>} className="packet-disclosure">
      <div className="packet-nodes compact">
        <div className="packet-node primary"><b>01</b><div><strong>Late Payment Letter</strong><small>{late.file || 'Only required when late-payment data exists'}</small></div><Badge ready={Boolean(late.file)}>{late.file ? 'DOCX saved' : 'Optional'}</Badge><LetterActions slot={late} node="LATE_LETTER" /></div>
        <Arrow />
        <div className="packet-node linked"><b>02</b><div><strong>Supporting Documents</strong><small>Same client evidence page from Source Data</small></div><Badge ready={supportingReady}>{supportingReady ? 'Available' : 'Later'}</Badge></div>
        <p className="packet-only-note">This packet appears only when the TXT source contains late-payment items. Dispute-only inserts stay hidden from this flow.</p>
      </div>
    </ProgressiveDisclosure>
    <ProgressiveDisclosure open={showGuidance} onToggle={() => setShowGuidance((value) => !value)} title="Template behavior reference" summary="Details for editable and static components" className="rule-disclosure">
      <div className="template-rule-grid"><article><strong>Editable templates</strong><p>Dispute Letter, Late Payment Letter, Affidavit and FTC are DOCX files populated from source and reviewed before final PDF generation.</p></article><article><strong>Static merge-only files</strong><p>FCRA and Attachment are PDFs placed into the final Dispute PDF exactly in sequence without editor changes.</p></article></div>
    </ProgressiveDisclosure>
  </section>;
}
