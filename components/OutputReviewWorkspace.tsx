'use client';

import { useEffect, useMemo, useState } from 'react';
import { DocumentEditor } from '@onlyoffice/document-editor-react';

export type ReviewOutput = { path: string; type: 'DISPUTE' | 'LATE_PAYMENT'; bureau: string; count: number; detail: string; blob: Blob };
type Filter = 'ALL' | 'DISPUTE' | 'LATE_PAYMENT';
type Props = { round: string; outputs: ReviewOutput[]; zipName?: string; warnings: string[]; onZip: () => void; onDownload: (output: ReviewOutput) => void; onReplace: (output: ReviewOutput, file: File) => void | Promise<void>; onRemove: (output: ReviewOutput) => void | Promise<void> };
type EditorSession = { resultUrl: string; documentServerUrl: string; config: Record<string, unknown> };

export default function OutputReviewWorkspace({ round, outputs, zipName, warnings, onZip, onReplace }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [editorStatus, setEditorStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const selected = outputs.find((item) => item.path === selectedPath) || null;
  const dispute = outputs.filter((item) => item.type === 'DISPUTE').length;
  const late = outputs.filter((item) => item.type === 'LATE_PAYMENT').length;
  const visible = useMemo(() => filter === 'ALL' ? outputs : outputs.filter((item) => item.type === filter), [filter, outputs]);

  useEffect(() => {
    if (!selected) { setSession(null); return; }
    let active = true;
    setEditorStatus('Preparing editable DOCX…');
    const filename = selected.path.split('/').pop() || 'letter.docx';
    const form = new FormData();
    form.append('file', selected.blob, filename);
    form.append('title', filename);
    void fetch('/api/editor/sessions', { method: 'POST', body: form }).then(async (response) => {
      const result = await response.json() as EditorSession & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to start live editing.');
      if (active) { setSession(result); setEditorStatus('Edit directly in the document. Save inside the editor, then apply saved edits to the ZIP package.'); }
    }).catch((error: Error) => { if (active) setEditorStatus(error.message); });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => { if (selectedPath && !outputs.some((item) => item.path === selectedPath)) setSelectedPath(null); }, [outputs, selectedPath]);

  async function applySavedEdits() {
    if (!selected || !session) return;
    setSaving(true);
    try {
      const response = await fetch(session.resultUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Edited document could not be retrieved.');
      if (!response.headers.get('X-Editor-Last-Saved')) throw new Error('No saved edit received yet. Save inside the editor, wait a moment, then try again.');
      const filename = selected.path.split('/').pop() || 'letter.docx';
      const edited = new File([await response.blob()], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      await onReplace(selected, edited);
      setEditorStatus('Saved. Your edited DOCX is now included in the ZIP package.');
    } catch (error) { setEditorStatus(error instanceof Error ? error.message : 'Unable to apply the edited document.'); }
    finally { setSaving(false); }
  }

  return <section className="outputs-workspace">
    <section className="panel package-overview">
      <header className="package-header"><div><p className="eyebrow">Delivery package</p><h2>{round} Letters</h2><p>Edit generated documents directly, then download one verified ZIP package.</p></div><span className="package-count">{outputs.length} DOCX</span></header>
      {zipName && <div className="package-delivery"><div><strong>{zipName}</strong><span>Generated DOCX files and decision manifest</span></div><button className="package-download" onClick={onZip}>Download ZIP Package <i>↓</i></button></div>}
      <div className="package-metrics"><button className={filter === 'ALL' ? 'selected' : ''} onClick={() => setFilter('ALL')}><small>All Outputs</small><strong>{outputs.length}</strong></button><button className={filter === 'DISPUTE' ? 'selected' : ''} onClick={() => setFilter('DISPUTE')}><small>Dispute Letters</small><strong>{dispute}</strong></button><button className={filter === 'LATE_PAYMENT' ? 'selected' : ''} onClick={() => setFilter('LATE_PAYMENT')}><small>Late Payment</small><strong>{late}</strong></button></div>
    </section>
    <section className="panel documents-library"><header className="library-header"><div><h2>Document Editing</h2><p>Open any letter to edit its text, spacing, color and formatting.</p></div><nav><button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>All</button><button className={filter === 'DISPUTE' ? 'active' : ''} onClick={() => setFilter('DISPUTE')}>Dispute</button><button className={filter === 'LATE_PAYMENT' ? 'active' : ''} onClick={() => setFilter('LATE_PAYMENT')}>Late Payment</button></nav></header>
      <div className="review-cards">{visible.map((output) => <article className="review-card" key={output.path}><div className="review-card-head"><span className={`doc-type ${output.type === 'LATE_PAYMENT' ? 'late' : ''}`}>{output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'}</span><span>{output.bureau}</span></div><h3>{output.path.split('/').pop()}</h3><p>{output.count} item block{output.count === 1 ? '' : 's'} · {output.detail}</p><div className="review-actions"><button className="edit-document" onClick={() => setSelectedPath(output.path)}>Edit Document</button></div></article>)}</div>
      {!visible.length && <div className="library-empty">No documents in this category.</div>}
      {warnings.length > 0 && <div className="failed-output-list">{warnings.map((warning) => <article className="failed-output" key={warning}><strong>Not generated</strong><p>{warning}</p></article>)}</div>}
    </section>
    {selected && <div className="word-editor-backdrop"><section className="word-editor-modal" role="dialog" aria-modal="true"><header className="word-editor-header"><div><p className="eyebrow">Live DOCX editor</p><h2>{selected.path.split('/').pop()}</h2><span>{selected.bureau} · {selected.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter'}</span></div><div className="word-editor-controls"><button className="save-edits" disabled={!session || saving} onClick={() => void applySavedEdits()}>{saving ? 'Saving…' : 'Apply Saved Edits to Package'}</button><button className="close-editor" onClick={() => setSelectedPath(null)} aria-label="Close editor">×</button></div></header><div className="word-editor-status">{editorStatus}</div><div className="word-editor-host">{session && <DocumentEditor id="live-docx-editor" documentServerUrl={session.documentServerUrl} config={session.config} onLoadComponentError={(_, description) => setEditorStatus(description)} />}</div></section></div>}
  </section>;
}
