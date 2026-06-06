'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadTemplateExhibits } from '../lib/template-exhibits';
import type { PacketAssets } from '../lib/packet-assets';
import MeasuredDocxEditorSection from './MeasuredDocxEditorSection';
import PacketInsertViewer from './PacketInsertViewer';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = {
  round: string;
  output: ReviewOutput;
  documents: ReviewOutput[];
  initialDocumentPath?: string;
  evidenceKey?: string;
  evidence?: PacketAssets;
  warnings?: string[];
  onEvidenceChanged?: (assets: PacketAssets) => void;
  onMessage?: (message: string) => void;
  onClose: () => void;
  onSave: (output: ReviewOutput, file: File) => void | Promise<void>;
};
type SlotId = 'LETTER' | 'SUPPORTING' | 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT';
type Slot = { id: SlotId; number: number; label: string; document?: ReviewOutput; configured?: boolean; message: string };
function roleOf(output: ReviewOutput) { return output.role || 'LETTER'; }
function stateOf(slot: Slot) { return slot.document ? 'Editable DOCX' : slot.id === 'SUPPORTING' ? 'Evidence layout' : slot.configured ? 'Configured' : 'Not generated'; }
function slotForDocument(path: string | undefined, documents: ReviewOutput[]): SlotId { return documents.find((document) => document.path === path)?.role === 'AFFIDAVIT' ? 'AFFIDAVIT' : 'LETTER'; }
function missingReason(slot: Slot, warnings: string[]) {
  if (slot.id === 'AFFIDAVIT') return warnings.find((message) => /^Affidavit\s*:/i.test(message)) || 'Affidavit document was not generated. Review the Affidavit template mapping and source data, then regenerate documents.';
  return slot.message || 'No generated document for this packet position.';
}
function PacketInsertSection({ slot, round, evidenceKey, evidence, warnings, toolbarTargetId, onEvidenceChanged, onMessage }: { slot: Slot; round: Props['round']; evidenceKey?: string; evidence?: PacketAssets; warnings: string[]; toolbarTargetId?: string; onEvidenceChanged?: Props['onEvidenceChanged']; onMessage?: Props['onMessage'] }) {
  const viewable = slot.id === 'SUPPORTING' || slot.id === 'FCRA' || slot.id === 'ATTACHMENT';
  return <article className="packet-focus-section packet-stack-insert" data-slot={slot.id}>{viewable ? <PacketInsertViewer kind={slot.id as 'SUPPORTING' | 'FCRA' | 'ATTACHMENT'} round={round} evidenceKey={evidenceKey} evidence={evidence} toolbarTargetId={slot.id === 'SUPPORTING' ? toolbarTargetId : undefined} onEvidenceChanged={onEvidenceChanged} onMessage={onMessage} /> : <div className="packet-insert-status missing"><strong>{slot.label} not generated</strong><span>{missingReason(slot, warnings)}</span></div>}</article>;
}
export default function SimpleDocxEditor({ round, output, documents, initialDocumentPath, evidenceKey, evidence, warnings = [], onEvidenceChanged, onMessage, onClose, onSave }: Props) {
  const [active, setActive] = useState<SlotId>(() => slotForDocument(initialDocumentPath, documents));
  const exhibits = useMemo(() => loadTemplateExhibits(round), [round]);
  const letter = documents.find((document) => roleOf(document) === 'LETTER') || output;
  const affidavit = documents.find((document) => roleOf(document) === 'AFFIDAVIT');
  const slots: Slot[] = output.type === 'DISPUTE' ? [
    { id: 'LETTER', number: 1, label: 'Dispute Letter', document: letter, message: 'Editable DOCX component' },
    { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', configured: Boolean(evidence?.supporting.length), message: 'One-page evidence layout' },
    { id: 'FCRA', number: 3, label: 'FCRA', configured: Boolean(exhibits.FCRA), message: exhibits.FCRA ? 'Configured insert' : 'Not configured' },
    { id: 'AFFIDAVIT', number: 4, label: 'Affidavit', document: affidavit, configured: Boolean(affidavit), message: affidavit ? 'Editable DOCX component' : 'Not generated' },
    { id: 'ATTACHMENT', number: 5, label: 'Attachment', configured: Boolean(exhibits.ATTACHMENT), message: exhibits.ATTACHMENT ? 'Configured insert' : 'Not configured' }
  ] : [
    { id: 'LETTER', number: 1, label: 'Late Payment Letter', document: letter, message: 'Editable DOCX component' },
    { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', configured: Boolean(evidence?.supporting.length), message: 'One-page evidence layout' }
  ];
  useEffect(() => { setActive(slotForDocument(initialDocumentPath, documents)); }, [initialDocumentPath, output.path, documents]);
  const activeIndex = Math.max(0, slots.findIndex((slot) => slot.id === active));
  const selected = slots[activeIndex];
  const previous = activeIndex > 0 ? slots[activeIndex - 1] : null;
  const next = activeIndex < slots.length - 1 ? slots[activeIndex + 1] : null;
  const evidenceToolsId = `packet-evidence-tools-${output.bureau.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;
  return <div className="simple-editor-backdrop"><section className="simple-editor-modal ordered-packet-modal premium-document-editor focused-packet-editor consolidated-packet-editor" role="dialog" aria-modal="true" aria-label={`${output.bureau} ordered packet editor`}><header className="simple-editor-header editor-command-header"><div className="editor-command-identity"><div className="editor-packet-name"><p className="eyebrow">Packet editor</p><h2>{output.bureau} {output.type === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</h2><div className="editor-context-tags"><span>{round}</span><span>{slots.length} positions</span></div></div><span className="editor-command-separator" aria-hidden="true" /><div className="editor-active-document"><p className="eyebrow">Current document</p><strong><b>{String(selected.number).padStart(2, '0')}</b>{selected.label}</strong><small>{stateOf(selected)}</small></div></div>{selected.id === 'SUPPORTING' && evidence?.supporting.length ? <div className="packet-header-evidence-slot" id={evidenceToolsId} aria-label="Evidence image tools" /> : null}<div className="editor-command-actions"><div className="packet-focus-controls"><button type="button" className="secondary-button" disabled={!previous} onClick={() => previous && setActive(previous.id)}>Previous document</button><button type="button" className="secondary-button" disabled={!next} onClick={() => next && setActive(next.id)}>Next document</button></div><button type="button" className="close-editor" onClick={onClose} aria-label="Close editor">×</button></div></header><div className="ordered-packet-body"><aside className="editor-packet-map document-rail"><header><p className="eyebrow">Packet order</p><h3>Documents</h3></header><ol>{slots.map((slot) => <li className={active === slot.id ? 'current editable' : 'editable'} key={slot.id}><button type="button" onClick={() => setActive(slot.id)}><b>{String(slot.number).padStart(2, '0')}</b><div><strong>{slot.label}</strong><small>{stateOf(slot)}</small></div></button></li>)}</ol></aside><main className="packet-focus-workspace"><div className="packet-focus-scroll">{selected.document ? <MeasuredDocxEditorSection key={`${output.path}-${selected.id}`} slotId={selected.id} label={selected.label} output={selected.document} onSave={onSave} /> : <PacketInsertSection key={`${output.path}-${selected.id}`} slot={selected} round={round} evidenceKey={evidenceKey} evidence={evidence} warnings={warnings} toolbarTargetId={evidenceToolsId} onEvidenceChanged={onEvidenceChanged} onMessage={onMessage} />}</div></main></div></section></div>;
}
