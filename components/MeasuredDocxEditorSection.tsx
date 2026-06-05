'use client';

import { useEffect, useState } from 'react';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph } from '../lib/simple-docx-editor';
import DocxProofPreview from './DocxProofPreview';
import StructuredDocxEditor from './StructuredDocxEditor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { label: string; slotId: string; output: ReviewOutput; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };
function fileName(output: ReviewOutput) { return output.path.split('/').pop() || 'document.docx'; }
export default function MeasuredDocxEditorSection({ label, slotId, output, onSave }: Props) {
  const [paragraphs, setParagraphs] = useState<EditableParagraph[]>([]);
  const [activeId, setActiveId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading editable DOCX source');
  useEffect(() => {
    let alive = true;
    setDirty(false); setStatus('Loading editable DOCX source'); setParagraphs([]); setActiveId('');
    void readEditableParagraphs(output.blob).then((items) => {
      if (!alive) return;
      setParagraphs(items);
      setActiveId(items[0]?.id || '');
      setStatus('DOCX source ready');
    }).catch((error: Error) => { if (alive) setStatus(error.message); });
    return () => { alive = false; };
  }, [output.blob]);
  function updateParagraph(id: string, change: Partial<EditableParagraph>) {
    setParagraphs((current) => current.map((paragraph) => paragraph.id === id ? { ...paragraph, ...change, dirty: true } : paragraph));
    setActiveId(id);
    setDirty(true);
    setStatus('Unsaved DOCX changes');
  }
  async function save() {
    setSaving(true); setStatus('Saving DOCX and rebuilding proof');
    try {
      const blob = await saveEditedParagraphs(output.blob, paragraphs);
      await onSave(output, new File([blob], fileName(output), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      setDirty(false);
      setParagraphs((current) => current.map((paragraph) => ({ ...paragraph, dirty: false })));
      setStatus('Saved · proof rebuilding');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setSaving(false); }
  }
  return <article className="packet-focus-section packet-stack-editable docx-proof-editor" data-slot={slotId}>
    <div className="packet-document-toolbar"><div className="docx-proof-source-status"><strong>Editable DOCX source</strong><span>{paragraphs.length ? `${paragraphs.length} paragraphs mapped` : 'Mapping paragraphs'}</span></div><span className={`packet-edit-state ${dirty ? 'changed' : ''}`}>{status}</span><button className="packet-save-button" type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save changes and rebuild proof' : 'Saved'}</button></div>
    <DocxProofPreview output={output} label={label} />
    <StructuredDocxEditor paragraphs={paragraphs} activeId={activeId} onSelect={setActiveId} onChange={updateParagraph} />
  </article>;
}
