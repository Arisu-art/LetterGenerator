'use client';

import { useEffect, useState } from 'react';
import { loadTemplateExhibits, removeTemplateExhibit, saveTemplateExhibit, type ExhibitKind, type TemplateExhibits } from '../lib/template-exhibits';

type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
type Slot = { id: string; type: LetterType; name: string; file: string; size?: number };
type Props = {
  round: string;
  slots: Slot[];
  supportingReady: boolean;
  onUploadLetter: (slot: Slot, file: File) => Promise<void>;
  onRemoveLetter: (slot: Slot) => Promise<void>;
  onExhibitsChange: (value: TemplateExhibits) => void;
  onMessage: (message: string) => void;
};
const exhibitOrder: Array<{ kind: ExhibitKind; title: string; accept: string }> = [
  { kind: 'FCRA', title: 'FCRA', accept: '.pdf,application/pdf' },
  { kind: 'AFFIDAVIT', title: 'Affidavit', accept: '.pdf,.docx,application/pdf' },
  { kind: 'ATTACHMENT', title: 'Attachment', accept: '.pdf,.docx,.png,.jpg,.jpeg,.webp' },
  { kind: 'FTC', title: 'FTC', accept: '.pdf,.docx,.png,.jpg,.jpeg,.webp' }
];
function Badge({ ready, children }: { ready: boolean; children: React.ReactNode }) { return <span className={`packet-status ${ready ? 'ready' : ''}`}>{children}</span>; }
function Arrow() { return <span className="packet-arrow" aria-hidden="true">↓</span>; }

export default function TemplatePacketConfigurator({ round, slots, supportingReady, onUploadLetter, onRemoveLetter, onExhibitsChange, onMessage }: Props) {
  const [open, setOpen] = useState<LetterType | null>(null);
  const [exhibits, setExhibits] = useState<TemplateExhibits>({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
  const dispute = slots.find((slot) => slot.type === 'DISPUTE')!;
  const late = slots.find((slot) => slot.type === 'LATE_PAYMENT')!;
  useEffect(() => { const saved = loadTemplateExhibits(round); setExhibits(saved); onExhibitsChange(saved); setOpen(null); }, [round]);
  async function uploadExhibit(kind: ExhibitKind, file: File) { try { const next = await saveTemplateExhibit(round, kind, file); setExhibits(next); onExhibitsChange(next); onMessage(`${kind} saved for ${round}.`); } catch (error) { onMessage(error instanceof Error ? error.message : 'File could not be saved.'); } }
  async function removeExhibit(kind: ExhibitKind) { const next = await removeTemplateExhibit(round, kind); setExhibits(next); onExhibitsChange(next); onMessage(`${kind} removed from ${round}.`); }
  function LetterUpload({ slot }: { slot: Slot }) { return <div className="node-actions"><label><span>Upload or replace DOCX</span><input type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadLetter(slot, file); event.target.value = ''; }} /></label>{slot.file && <button onClick={() => void onRemoveLetter(slot)}>Remove</button>}</div>; }
  function PacketHead({ slot, summary }: { slot: Slot; summary: string }) { const expanded = open === slot.type; return <button className="packet-collapse" onClick={() => setOpen(expanded ? null : slot.type)} aria-expanded={expanded}><div><strong>{slot.name}</strong><small>{summary}</small></div><Badge ready={Boolean(slot.file)}>{slot.file ? 'Saved' : 'Needed'}</Badge><i>{expanded ? '−' : '+'}</i></button>; }
  return <section className="panel template-packet-config">
    <header className="packet-config-heading"><div><h2>Document packet order</h2><p>Each packet is collapsed by default. Open one to manage its reusable files and fixed exhibits.</p></div><span className="config-rule">Supporting Document is uploaded in Source Data</span></header>
    <article className={`packet-collapse-card ${open === 'DISPUTE' ? 'expanded' : ''}`}>
      <PacketHead slot={dispute} summary="Supporting Document inside letter → FCRA → Affidavit → Attachment → FTC" />
      {open === 'DISPUTE' && <div className="packet-nodes">
        <div className="packet-node primary"><b>01</b><div><strong>Dispute Letter DOCX</strong><small>{dispute.file || 'Reusable reference required'}</small></div><Badge ready={Boolean(dispute.file)}>{dispute.file ? 'Saved' : 'Needed'}</Badge><LetterUpload slot={dispute} /></div>
        <Arrow />
        <div className="packet-node linked"><b>02</b><div><strong>Supporting Document</strong><small>Uploaded with TXT source data and inserted inside letter</small></div><Badge ready={supportingReady}>{supportingReady ? 'Attached' : 'Source Data'}</Badge></div>
        {exhibitOrder.map((item, index) => <div className="exhibit-flow" key={item.kind}><Arrow /><div className="packet-node exhibit"><b>{String(index + 3).padStart(2, '0')}</b><div><strong>{item.title}</strong><small>{exhibits[item.kind]?.name || 'Static dispute packet exhibit'}</small></div><Badge ready={Boolean(exhibits[item.kind])}>{exhibits[item.kind] ? 'Saved' : 'Optional'}</Badge><div className="node-actions"><label><span>Upload / Replace</span><input type="file" accept={item.accept} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadExhibit(item.kind, file); event.target.value = ''; }} /></label>{exhibits[item.kind] && <button onClick={() => void removeExhibit(item.kind)}>Remove</button>}</div></div></div>)}
      </div>}
    </article>
    <article className={`packet-collapse-card ${open === 'LATE_PAYMENT' ? 'expanded' : ''}`}>
      <PacketHead slot={late} summary="Supporting Document inside letter only" />
      {open === 'LATE_PAYMENT' && <div className="packet-nodes compact">
        <div className="packet-node primary"><b>01</b><div><strong>Late Payment Letter DOCX</strong><small>{late.file || 'Reusable reference required'}</small></div><Badge ready={Boolean(late.file)}>{late.file ? 'Saved' : 'Needed'}</Badge><LetterUpload slot={late} /></div>
        <Arrow />
        <div className="packet-node linked"><b>02</b><div><strong>Supporting Document</strong><small>Uploaded with TXT source data and inserted inside letter</small></div><Badge ready={supportingReady}>{supportingReady ? 'Attached' : 'Source Data'}</Badge></div>
        <p className="packet-only-note">FCRA, Affidavit, Attachment and FTC are dispute-only exhibits and are not included in Late Payment output.</p>
      </div>}
    </article>
  </section>;
}
