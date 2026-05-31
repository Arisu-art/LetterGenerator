'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
    ? 'Editable DOCX template - source placeholders filled during generation'
    : 'Static PDF - merged into final PDF without text editing';
}

export default function TemplatePacketConfigurator({ round, slots, supportingReady, onUploadLetter, onRemoveLetter, onExhibitsChange, onMessage }: Props) {
  const [open, setOpen] = useState<LetterType | null>(null);
  const [exhibits, setExhibits] = useState<TemplateExhibits>({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
  const dispute = slots.find((slot) => slot.type === 'DISPUTE')!;
  const late = slots.find((slot) => slot.type === 'LATE_PAYMENT')!;
  useEffect(() => {
    const saved = loadTemplateExhibits(round);
    setExhibits(saved);
    onExhibitsChange(saved);
    setOpen(null);
  }, [round]);
  async function uploadExhibit(kind: ExhibitKind, file: File) {
    try {
      const next = await saveTemplateExhibit(round, kind, file);
      setExhibits(next);
      onExhibitsChange(next);
      onMessage(`${exhibitTitles[kind]} saved for ${round}.`);
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
  function LetterUpload({ slot }: { slot: Slot }) {
    return <div className="node-actions"><label><span>Upload / Replace DOCX</span><input type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadLetter(slot, file); event.target.value = ''; }} /></label>{slot.file && <button onClick={() => void onRemoveLetter(slot)}>Remove</button>}</div>;
  }
  function PacketHead({ slot, summary }: { slot: Slot; summary: string }) {
    const expanded = open === slot.type;
    return <button className="packet-collapse" onClick={() => setOpen(expanded ? null : slot.type)} aria-expanded={expanded}><div><strong>{slot.name}</strong><small>{summary}</small></div><Badge ready={Boolean(slot.file)}>{slot.file ? 'Configured' : 'Needed'}</Badge><i>{expanded ? '−' : '+'}</i></button>;
  }
  return <section className="panel template-packet-config">
    <header className="packet-config-heading"><div><p className="eyebrow">Template architecture</p><h2>Document packet order</h2><p>Open a packet to configure reusable files. DOCX nodes are editable generated documents; PDF nodes are merged unchanged during finalization.</p></div><span className="config-rule">Supporting Document is uploaded in Source Data</span></header>
    <article className={`packet-collapse-card ${open === 'DISPUTE' ? 'expanded' : ''}`}>
      <PacketHead slot={dispute} summary="Letter → Supporting → FCRA → Affidavit → Attachment → FTC" />
      {open === 'DISPUTE' && <div className="packet-nodes">
        <div className="packet-node primary"><b>01</b><div><strong>Dispute Letter</strong><small>{dispute.file || 'Editable DOCX reference required'}</small></div><Badge ready={Boolean(dispute.file)}>{dispute.file ? 'DOCX saved' : 'Required'}</Badge><LetterUpload slot={dispute} /></div>
        <Arrow />
        <div className="packet-node linked"><b>02</b><div><strong>Supporting Documents</strong><small>One aligned client evidence page - uploaded with source TXT</small></div><Badge ready={supportingReady}>{supportingReady ? 'Available' : 'Source Data'}</Badge></div>
        {exhibitKinds.map((kind, index) => <div className="exhibit-flow" key={kind}><Arrow /><div className={`packet-node exhibit ${exhibitModes[kind] === 'GENERATED_DOCX' ? 'editable-node' : 'static-node'}`}><b>{String(index + 3).padStart(2, '0')}</b><div><strong>{exhibitTitles[kind]}</strong><small>{exhibits[kind]?.name || kindDescription(kind)}</small></div><Badge ready={Boolean(exhibits[kind])}>{exhibits[kind] ? exhibitModes[kind] === 'GENERATED_DOCX' ? 'DOCX saved' : 'PDF saved' : 'Needed'}</Badge><div className="node-actions"><label><span>Upload / Replace {exhibitModes[kind] === 'GENERATED_DOCX' ? 'DOCX' : 'PDF'}</span><input type="file" accept={exhibitAccept[kind]} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadExhibit(kind, file); event.target.value = ''; }} /></label>{exhibits[kind] && <button onClick={() => void removeExhibit(kind)}>Remove</button>}</div></div></div>)}
      </div>}
    </article>
    <article className={`packet-collapse-card ${open === 'LATE_PAYMENT' ? 'expanded' : ''}`}>
      <PacketHead slot={late} summary="Letter → Supporting Documents" />
      {open === 'LATE_PAYMENT' && <div className="packet-nodes compact">
        <div className="packet-node primary"><b>01</b><div><strong>Late Payment Letter</strong><small>{late.file || 'Editable DOCX reference required'}</small></div><Badge ready={Boolean(late.file)}>{late.file ? 'DOCX saved' : 'Required'}</Badge><LetterUpload slot={late} /></div>
        <Arrow />
        <div className="packet-node linked"><b>02</b><div><strong>Supporting Documents</strong><small>Same aligned client evidence page from Source Data</small></div><Badge ready={supportingReady}>{supportingReady ? 'Available' : 'Source Data'}</Badge></div>
        <p className="packet-only-note">FCRA, Affidavit, Attachment and FTC belong only to the Dispute packet sequence.</p>
      </div>}
    </article>
    <div className="template-rule-grid"><article><strong>Editable templates</strong><p>Dispute Letter, Late Payment Letter, Affidavit and FTC are DOCX files populated from source and reviewed before final PDF generation.</p></article><article><strong>Static merge-only files</strong><p>FCRA and Attachment are PDFs placed into the final Dispute PDF exactly in sequence without editor changes.</p></article></div>
  </section>;
}
