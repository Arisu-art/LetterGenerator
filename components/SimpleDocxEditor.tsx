'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph } from '../lib/simple-docx-editor';
import { loadTemplateExhibits } from '../lib/template-exhibits';
import type { PacketAssets } from '../lib/packet-assets';
import PacketInsertViewer from './PacketInsertViewer';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = {
  round: string;
  output: ReviewOutput;
  documents: ReviewOutput[];
  evidenceKey?: string;
  evidence?: PacketAssets;
  onEvidenceChanged?: (assets: PacketAssets) => void;
  onMessage?: (message: string) => void;
  onClose: () => void;
  onSave: (output: ReviewOutput, file: File) => void | Promise<void>;
};
type SlotId = 'LETTER' | 'SUPPORTING' | 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';
type Slot = { id: SlotId; number: number; label: string; document?: ReviewOutput; configured?: boolean; message: string };
function fileName(output: ReviewOutput) { return output.path.split('/').pop() || 'document.docx'; }
function roleOf(output: ReviewOutput) { return output.role || 'LETTER'; }
function textOf(node: HTMLElement) { return (node.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); }
function stateOf(slot: Slot) { return slot.document ? 'Editable DOCX' : slot.id === 'SUPPORTING' ? 'Evidence layout' : slot.configured ? 'Configured' : 'None'; }

function EditablePacketSection({ slot, onSave }: { slot: Slot; onSave: Props['onSave'] }) {
  const output = slot.document!;
  const host = useRef<HTMLDivElement>(null);
  const [paragraphs, setParagraphs] = useState<EditableParagraph[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading document');
  useEffect(() => {
    let alive = true;
    setDirty(false);
    setStatus('Loading document');
    void Promise.all([readEditableParagraphs(output.blob), import('docx-preview')]).then(async ([items, docx]) => {
      if (!alive || !host.current) return;
      setParagraphs(items);
      host.current.innerHTML = '';
      await docx.renderAsync(await output.blob.arrayBuffer(), host.current, undefined, { className: 'packet-inline-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: false, renderFooters: false });
      if (!alive || !host.current) return;
      const nodes = Array.from(host.current.querySelectorAll<HTMLElement>('.packet-inline-docx p')).filter((node) => (node.textContent || '').trim().length > 0);
      items.forEach((item, index) => {
        const node = nodes[index];
        if (!node) return;
        node.contentEditable = 'true';
        node.spellcheck = true;
        node.setAttribute('aria-label', `${slot.label} paragraph ${index + 1}`);
        node.addEventListener('input', () => { setDirty(true); setParagraphs((current) => current.map((entry) => entry.id === item.id ? { ...entry, text: textOf(node), dirty: true } : entry)); });
      });
      setStatus('Editable DOCX');
    }).catch((error: Error) => { if (alive) setStatus(error.message); });
    return () => { alive = false; };
  }, [output.blob, slot.label]);
  async function save() {
    setSaving(true); setStatus('Saving');
    try { const blob = await saveEditedParagraphs(output.blob, paragraphs); await onSave(output, new File([blob], fileName(output), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); setDirty(false); setStatus('Saved'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setSaving(false); }
  }
  return <article className="packet-focus-section packet-stack-section packet-stack-editable" data-slot={slot.id}><header className="packet-stack-header"><b>{String(slot.number).padStart(2, '0')}</b><div><h3>{slot.label}</h3><p>{status}</p></div><button disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button></header><div ref={host} className="packet-inline-docx-host" /></article>;
}

function PacketInsertSection({ slot, round, evidenceKey, evidence, onEvidenceChanged, onMessage }: { slot: Slot; round: Props['round']; evidenceKey?: string; evidence?: PacketAssets; onEvidenceChanged?: Props['onEvidenceChanged']; onMessage?: Props['onMessage'] }) {
  const viewable = slot.id === 'SUPPORTING' || slot.id === 'FCRA' || slot.id === 'ATTACHMENT';
  const state = slot.id === 'SUPPORTING' ? 'Layout editor' : slot.configured ? 'Configured' : 'None';
  return <article className="packet-focus-section packet-stack-section packet-stack-insert" data-slot={slot.id}><header className="packet-stack-header"><b>{String(slot.number).padStart(2, '0')}</b><div><h3>{slot.label}</h3><p>{slot.message}</p></div><span className={`packet-stack-state ${slot.id === 'SUPPORTING' ? 'managed' : slot.configured ? 'ready' : 'none'}`}>{state}</span></header>{viewable ? <PacketInsertViewer kind={slot.id as 'SUPPORTING' | 'FCRA' | 'ATTACHMENT'} round={round} evidenceKey={evidenceKey} evidence={evidence} onEvidenceChanged={onEvidenceChanged} onMessage={onMessage} /> : <div className="packet-insert-status missing"><strong>None</strong><span>No generated document for this packet position.</span></div>}</article>;
}

export default function SimpleDocxEditor({ round, output, documents, evidenceKey, evidence, onEvidenceChanged, onMessage, onClose, onSave }: Props) {
  const [active, setActive] = useState<SlotId>('LETTER');
  const exhibits = useMemo(() => loadTemplateExhibits(round), [round]);
  const letter = documents.find((document) => roleOf(document) === 'LETTER') || output;
  const affidavit = documents.find((document) => roleOf(document) === 'AFFIDAVIT');
  const ftc = documents.find((document) => roleOf(document) === 'FTC');
  const slots: Slot[] = output.type === 'DISPUTE' ? [
    { id: 'LETTER', number: 1, label: 'Dispute Letter', document: letter, message: 'Editable DOCX component' },
    { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', configured: Boolean(evidence?.supporting.length), message: 'One-page evidence layout' },
    { id: 'FCRA', number: 3, label: 'FCRA', configured: Boolean(exhibits.FCRA), message: exhibits.FCRA ? 'Configured insert' : 'Not configured' },
    { id: 'AFFIDAVIT', number: 4, label: 'Affidavit', document: affidavit, configured: Boolean(affidavit), message: affidavit ? 'Editable DOCX component' : 'Not generated' },
    { id: 'ATTACHMENT', number: 5, label: 'Attachment', configured: Boolean(exhibits.ATTACHMENT), message: exhibits.ATTACHMENT ? 'Configured insert' : 'Not configured' },
    { id: 'FTC', number: 6, label: 'FTC Report', document: ftc, configured: Boolean(ftc), message: ftc ? 'Editable DOCX component' : 'Not generated' }
  ] : [{ id: 'LETTER', number: 1, label: 'Late Payment Letter', document: letter, message: 'Editable DOCX component' }, { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', configured: Boolean(evidence?.supporting.length), message: 'One-page evidence layout' }];
  useEffect(() => { setActive('LETTER'); }, [output.path]);
  const activeIndex = Math.max(0, slots.findIndex((slot) => slot.id === active));
  const selected = slots[activeIndex];
  const previous = activeIndex > 0 ? slots[activeIndex - 1] : null;
  const next = activeIndex < slots.length - 1 ? slots[activeIndex + 1] : null;
  return <div className="simple-editor-backdrop"><section className="simple-editor-modal ordered-packet-modal premium-document-editor focused-packet-editor" role="dialog" aria-modal="true" aria-label={`${output.bureau} ordered packet editor`}><header className="simple-editor-header"><div><p className="eyebrow">Packet editor</p><h2>{output.bureau} {output.type === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</h2><div className="editor-context-tags"><span>{round}</span><span>{slots.length} ordered positions</span><span>Focused editing</span></div></div><button className="close-editor" onClick={onClose} aria-label="Close editor">×</button></header><div className="ordered-packet-body"><aside className="editor-packet-map document-rail"><header><p className="eyebrow">Packet order</p><h3>Documents</h3></header><ol>{slots.map((slot) => <li className={active === slot.id ? 'current editable' : 'editable'} key={slot.id}><button type="button" onClick={() => setActive(slot.id)}><b>{String(slot.number).padStart(2, '0')}</b><div><strong>{slot.label}</strong><small>{stateOf(slot)}</small></div></button></li>)}</ol></aside><main className="packet-focus-workspace"><nav className="packet-focus-navigation" aria-label="Selected document navigation"><div><p className="eyebrow">Selected position</p><strong>{String(selected.number).padStart(2, '0')} · {selected.label}</strong></div><div className="packet-focus-controls"><button className="secondary-button" disabled={!previous} onClick={() => previous && setActive(previous.id)}>Previous</button><button className="secondary-button" disabled={!next} onClick={() => next && setActive(next.id)}>Next</button></div></nav><div className="packet-focus-scroll">{selected.document ? <EditablePacketSection key={`${output.path}-${selected.id}`} slot={selected} onSave={onSave} /> : <PacketInsertSection key={`${output.path}-${selected.id}`} slot={selected} round={round} evidenceKey={evidenceKey} evidence={evidence} onEvidenceChanged={onEvidenceChanged} onMessage={onMessage} />}</div></main></div></section></div>;
}
