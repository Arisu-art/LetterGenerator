'use client';

import { useEffect, useState, type ClipboardEvent, type ReactNode } from 'react';
import SupportingDocumentsSetup from './SupportingDocumentsSetup';
import { bureaus, type LetterRoute, type ParsedSource } from '../lib/letter-engine';
import type { PacketAssets } from '../lib/packet-assets';
import { runSharedTransition } from '../lib/shared-transition';

type Stage = 'SOURCE' | 'EVIDENCE' | 'GENERATE';
type SourceMethod = 'CHOOSE' | 'UPLOAD' | 'PASTE';
type Props = {
  source: string;
  originalSource: string;
  normalized: boolean;
  verified: boolean;
  parsed: ParsedSource;
  routes: LetterRoute[];
  sourceWarnings: Array<{ message: string }>;
  evidenceKey: string;
  evidence: PacketAssets;
  canGenerate: boolean;
  missingLetters: string[];
  missingInsertCount: number;
  affidavitRequired: boolean;
  strict: boolean;
  busy: boolean;
  onNormalize: (value: string, action: string) => void;
  onEditSource: (value: string) => void;
  onAffidavitJurisdictionChange: (field: 'state' | 'county', value: string) => void;
  onRestore: () => void;
  onEvidenceChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
  onGenerate: () => void | Promise<void>;
};
function SourceStageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <header className="source-progressive-command simplified-source-command">
    <div className="source-progressive-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>
    {children && <div className="source-command-actions">{children}</div>}
  </header>;
}
export default function GuidedSourceDataFlow({ source, originalSource, normalized, verified, parsed, routes, sourceWarnings, evidenceKey, evidence, canGenerate, missingLetters, missingInsertCount, affidavitRequired, strict, busy, onNormalize, onEditSource, onAffidavitJurisdictionChange, onRestore, onEvidenceChanged, onMessage, onGenerate }: Props) {
  const [stage, setStage] = useState<Stage>('SOURCE');
  const [method, setMethod] = useState<SourceMethod>(source ? 'PASTE' : 'CHOOSE');
  const evidenceReady = evidence.supporting.length > 0;
  const affidavitReady = !affidavitRequired || Boolean(parsed.affidavitState.trim() && parsed.affidavitCounty.trim());
  const blocked = !canGenerate || !evidenceReady || !affidavitReady || (strict && missingLetters.length > 0);
  const showStage = (next: Stage) => runSharedTransition(() => setStage(next), 'stage');
  useEffect(() => { setStage('SOURCE'); setMethod(source ? 'PASTE' : 'CHOOSE'); }, [evidenceKey]);
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const value = event.clipboardData.getData('text');
    if (!value.trim()) return;
    event.preventDefault();
    onNormalize(value, 'Pasted');
  }
  async function uploadFile(file?: File) {
    if (!file) return;
    setMethod('UPLOAD');
    onNormalize(await file.text(), 'Uploaded');
  }
  function lockSource() {
    if (!verified || !affidavitReady) {
      if (!affidavitReady) onMessage('Affidavit execution state and county are required before continuing.');
      return;
    }
    showStage('EVIDENCE');
    onMessage('Source data locked. Upload Supporting Documents evidence to continue.');
  }
  function confirmEvidence() {
    if (!evidenceReady) {
      onMessage('Supporting Documents are required. Upload at least one evidence image to continue.');
      return;
    }
    showStage('GENERATE');
    onMessage('Supporting Documents confirmed. Review routes and generate the package.');
  }
  return <div className="guided-source-workspace progressive-source-workspace">
    {stage === 'SOURCE' && method === 'CHOOSE' && !source && <section className="panel source-progressive-stage source-intake-stage shared-stage-surface" style={{ viewTransitionName: 'source-work-stage' }}>
      <SourceStageHeader eyebrow="Step 01 · Source TXT" title="Add client source data" description="Select one input method. The editing workspace opens only after you choose how to begin." />
      <div className="source-method-grid">
        <label className="source-method-card source-method-primary"><span className="source-method-number">01</span><strong>Upload TXT file</strong><p>Import an existing client source file and standardize it immediately.</p><span className="source-method-action">Choose file →</span><input type="file" accept=".txt" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
        <button type="button" className="source-method-card" onClick={() => setMethod('PASTE')}><span className="source-method-number">02</span><strong>Paste source text</strong><p>Paste data manually or begin from the standard TXT structure.</p><span className="source-method-action">Open editor →</span></button>
      </div>
      <div className="source-stage-note"><strong>TXT only</strong><span>Source data is normalized before evidence and generation become available.</span></div>
    </section>}
    {stage === 'SOURCE' && (method !== 'CHOOSE' || Boolean(source)) && <section className="panel source-progressive-stage source-editor-stage shared-stage-surface" style={{ viewTransitionName: 'source-work-stage' }}>
      <SourceStageHeader eyebrow="Step 01 · Source TXT" title="Review source data" description="Standardize and confirm the client record before moving to supporting evidence.">{source && <span className={`pill ${verified ? 'success' : 'neutral'}`}>{verified ? 'Normalized' : 'Editing'}</span>}</SourceStageHeader>
      <div className="source-editor-layout"><aside className="source-editor-tools"><div className="source-input-summary"><p className="eyebrow">Input method</p><strong>{method === 'UPLOAD' ? 'TXT upload' : 'Paste or manual entry'}</strong><small>{verified ? 'Ready to lock' : 'Needs standardization'}</small></div><label className="source-tool-upload"><span>Replace with TXT</span><input className="file-input" type="file" accept=".txt" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.target.value = ''; }} /></label>{!source && <button type="button" className="secondary-button" onClick={() => onNormalize('NAME:\nADDRESS:\nDOB:\nSSN:\nAFFIDAVIT STATE:\nAFFIDAVIT COUNTY:\n\nDISPUTE ACCOUNTS\n\nTRANSUNION\n\nEQUIFAX\n\nEXPERIAN\n\nHARD INQUIRIES\n', 'Standard format')}>Use blank format</button>}{source && !normalized && <button type="button" className="action-button" onClick={() => onNormalize(source, 'Edited')}>Standardize edits</button>}{originalSource && <button type="button" className="secondary-button" onClick={onRestore}>Restore original</button>}{!source && <button type="button" className="secondary-button" onClick={() => setMethod('CHOOSE')}>Choose another method</button>}{verified && <div className="source-record-summary"><p className="eyebrow">Detected client</p><strong>{parsed.name}</strong><span>{routes.length} output route{routes.length === 1 ? '' : 's'} detected</span></div>}</aside><textarea className="guided-source-text source-focused-text" value={source} onPaste={paste} onChange={(event) => onEditSource(event.target.value)} placeholder="Paste TXT source data here…" /></div>
      {affidavitRequired && <section className={`affidavit-source-panel ${affidavitReady ? 'ready' : 'required'}`} aria-label="Affidavit information">
        <header><div><p className="eyebrow">Affidavit information</p><h3>Execution jurisdiction</h3><p>Required for the editable affidavit in dispute packets. Confirm the jurisdiction where the affidavit will be executed or notarized.</p></div><span>{affidavitReady ? 'Ready' : 'Required'}</span></header>
        <div className="affidavit-source-grid"><label><span>State of execution</span><input value={parsed.affidavitState} onChange={(event) => onAffidavitJurisdictionChange('state', event.target.value)} placeholder="Example: North Carolina" /></label><label><span>County of execution</span><input value={parsed.affidavitCounty} onChange={(event) => onAffidavitJurisdictionChange('county', event.target.value)} placeholder="Example: Wake" /></label><article><span>Mapped from source data</span><strong>{parsed.name || 'Client name unavailable'}</strong><small>{parsed.address.join(' ') || 'Address unavailable'} · SSN {parsed.ssn || 'Unavailable'}</small></article></div>
      </section>}
      <footer className="guided-stage-footer source-progressive-footer"><span>{!affidavitReady ? 'Complete affidavit execution information to continue.' : verified ? 'Source data is ready to lock.' : 'Normalize a TXT source to continue.'}</span><button type="button" className="action-button" disabled={!verified || !affidavitReady} onClick={lockSource}>Lock Source Data</button></footer>
    </section>}
    {stage === 'EVIDENCE' && <section className="guided-evidence-stage source-progressive-evidence required-evidence-stage shared-stage-surface" style={{ viewTransitionName: 'source-work-stage' }}>
      <SourceStageHeader eyebrow="Step 02 · Required evidence" title="Supporting documents" description="Upload and arrange the required evidence page for packet position 02.">
        <div className="source-stage-actions"><button type="button" className="secondary-button" onClick={() => showStage('SOURCE')}>Back</button><button type="button" className="action-button" disabled={!evidenceReady} onClick={confirmEvidence}>Continue to Review</button></div>
      </SourceStageHeader>
      {evidenceKey && <SupportingDocumentsSetup embedded storageKey={evidenceKey} clientName={parsed.name} onChanged={onEvidenceChanged} onMessage={onMessage} />}
    </section>}
    {stage === 'GENERATE' && <section className="panel source-progressive-stage routes-stage generation-stage shared-stage-surface" style={{ viewTransitionName: 'source-work-stage' }}>
      <SourceStageHeader eyebrow="Step 03 · Review" title="Review and generate" description="Confirm detected bureau routes, then create editable ordered packet documents."><span className="pill neutral">{routes.length} output{routes.length === 1 ? '' : 's'}</span></SourceStageHeader>
      <div className="guided-route-grid">{bureaus.map((bureau) => <article className="guided-route-card" key={bureau}><strong>{bureau}</strong><div><span>{parsed.dispute[bureau].length} dispute</span><span>{parsed.inquiry[bureau].length} inquiry</span><span>{parsed.late[bureau].length} late</span></div></article>)}</div>
      {(sourceWarnings.length > 0 || missingLetters.length > 0 || !affidavitReady) && <div className="source-review"><strong>Needs attention</strong>{missingLetters.length > 0 && <p>Required letter template missing: {missingLetters.join(', ')}.</p>}{!affidavitReady && <p>Affidavit execution state and county must be completed before generation.</p>}{sourceWarnings.slice(0, 3).map((warning, index) => <p key={index}>{warning.message}</p>)}</div>}
      <div className="guided-generation-summary"><span className="complete">{evidence.supporting.length} evidence file(s) ready</span>{affidavitRequired && <span className={affidavitReady ? 'complete' : ''}>{affidavitReady ? 'Affidavit jurisdiction confirmed' : 'Affidavit jurisdiction required'}</span>}<span className={missingInsertCount ? '' : 'complete'}>{missingInsertCount ? `${missingInsertCount} optional insert(s) blank` : 'Optional inserts ready'}</span></div>
      <footer className="guided-stage-footer generate-footer"><button type="button" className="secondary-button" onClick={() => showStage('EVIDENCE')}>Back to Evidence</button><button type="button" className="action-button" disabled={blocked || busy} onClick={() => void onGenerate()}>{busy ? 'Generating package…' : 'Generate Ordered Review Package'}</button></footer>
    </section>}
  </div>;
}
