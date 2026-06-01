'use client';

import { useEffect, useState, type ClipboardEvent } from 'react';
import SupportingDocumentsSetup from './SupportingDocumentsSetup';
import { bureaus, type LetterRoute, type ParsedSource } from '../lib/letter-engine';
import type { PacketAssets } from '../lib/packet-assets';

type Stage = 'SOURCE' | 'EVIDENCE' | 'GENERATE';
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
  strict: boolean;
  busy: boolean;
  onNormalize: (value: string, action: string) => void;
  onEditSource: (value: string) => void;
  onRestore: () => void;
  onEvidenceChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
  onGenerate: () => void | Promise<void>;
};

function Step({ active, done, number, label }: { active: boolean; done: boolean; number: string; label: string }) {
  return <span className={`guided-source-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}><b>{done ? '✓' : number}</b><small>{label}</small></span>;
}

export default function GuidedSourceDataFlow({ source, originalSource, normalized, verified, parsed, routes, sourceWarnings, evidenceKey, evidence, canGenerate, missingLetters, missingInsertCount, strict, busy, onNormalize, onEditSource, onRestore, onEvidenceChanged, onMessage, onGenerate }: Props) {
  const [stage, setStage] = useState<Stage>('SOURCE');
  const blocked = !canGenerate || (strict && missingLetters.length > 0);

  useEffect(() => { setStage('SOURCE'); }, [evidenceKey]);
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const value = event.clipboardData.getData('text');
    if (!value.trim()) return;
    event.preventDefault();
    onNormalize(value, 'Pasted');
  }
  function lockSource() {
    if (!verified) return;
    setStage('EVIDENCE');
    onMessage('Source data locked. Add supporting evidence or continue without evidence.');
  }
  function confirmEvidence() {
    setStage('GENERATE');
    onMessage(evidence.supporting.length ? 'Evidence confirmed. Review routes and generate the package.' : 'No supporting evidence added. Position 02 will remain blank unless added later.');
  }

  return <div className="guided-source-workspace">
    <nav className="guided-source-progress" aria-label="Source Data workflow">
      <Step number="01" label="Source TXT" active={stage === 'SOURCE'} done={stage !== 'SOURCE'} />
      <Step number="02" label="Evidence" active={stage === 'EVIDENCE'} done={stage === 'GENERATE'} />
      <Step number="03" label="Review & Generate" active={stage === 'GENERATE'} done={false} />
    </nav>

    {stage === 'SOURCE' && <section className="panel guided-source-stage source-stage">
      <header className="guided-stage-heading"><div><p className="eyebrow">Step 01</p><h2>Source TXT</h2><p>Upload or paste the client TXT file, review the normalized data, then lock it.</p></div>{source && <span className={`pill ${verified ? 'success' : 'neutral'}`}>{verified ? 'Normalized' : 'Editing'}</span>}</header>
      <div className="guided-source-actions"><label className="guided-file-input"><span>Upload TXT source</span><input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) onNormalize(await file.text(), 'Uploaded'); event.target.value = ''; }} /></label>{!source && <button className="secondary-button" onClick={() => onNormalize('NAME:\nADDRESS:\nDOB:\nSSN:\n\nDISPUTE ACCOUNTS\n\nTRANSUNION\n\nEQUIFAX\n\nEXPERIAN\n\nHARD INQUIRIES\n', 'Standard format')}>Use blank format</button>}{source && !normalized && <button className="secondary-button" onClick={() => onNormalize(source, 'Edited')}>Standardize edits</button>}{originalSource && <button className="secondary-button" onClick={onRestore}>Restore</button>}</div>
      <textarea className="guided-source-text" value={source} onPaste={paste} onChange={(event) => onEditSource(event.target.value)} placeholder="Paste TXT source data here..." />
      <footer className="guided-stage-footer"><span>{verified ? 'Source data is ready to lock.' : 'Normalize a TXT source to continue.'}</span><button className="action-button" disabled={!verified} onClick={lockSource}>Lock Source Data</button></footer>
    </section>}

    {stage === 'EVIDENCE' && <section className="guided-evidence-stage">
      <header className="guided-stage-command"><div><p className="eyebrow">Step 02</p><h2>Supporting Documents</h2><p>Add evidence for packet position 02, or continue without evidence.</p></div><div><button className="secondary-button" onClick={() => setStage('SOURCE')}>Back to Source</button><button className="action-button" onClick={confirmEvidence}>{evidence.supporting.length ? 'Confirm Evidence' : 'Skip Evidence'}</button></div></header>
      {evidenceKey && <SupportingDocumentsSetup storageKey={evidenceKey} clientName={parsed.name} onChanged={onEvidenceChanged} onMessage={onMessage} />}
    </section>}

    {stage === 'GENERATE' && <section className="panel guided-source-stage routes-stage generation-stage">
      <header className="guided-stage-heading"><div><p className="eyebrow">Step 03</p><h2>Review & Generate</h2><p>Review detected bureau routes, then create editable ordered packet documents.</p></div><span className="pill neutral">{routes.length} output{routes.length === 1 ? '' : 's'}</span></header>
      <div className="guided-route-grid">{bureaus.map((bureau) => <article className="guided-route-card" key={bureau}><strong>{bureau}</strong><div><span>{parsed.dispute[bureau].length} dispute</span><span>{parsed.inquiry[bureau].length} inquiry</span><span>{parsed.late[bureau].length} late</span></div></article>)}</div>
      {(sourceWarnings.length > 0 || missingLetters.length > 0) && <div className="source-review"><strong>Needs attention</strong>{missingLetters.length > 0 && <p>Required letter template missing: {missingLetters.join(', ')}.</p>}{sourceWarnings.slice(0, 3).map((warning, index) => <p key={index}>{warning.message}</p>)}</div>}
      <div className="guided-generation-summary"><span className={evidence.supporting.length ? 'complete' : ''}>{evidence.supporting.length ? `${evidence.supporting.length} evidence file(s)` : 'Position 02 blank'}</span><span className={missingInsertCount ? '' : 'complete'}>{missingInsertCount ? `${missingInsertCount} optional insert(s) blank` : 'Optional inserts ready'}</span></div>
      <footer className="guided-stage-footer generate-footer"><button className="secondary-button" onClick={() => setStage('EVIDENCE')}>Back to Evidence</button><button className="action-button" disabled={blocked || busy} onClick={() => void onGenerate()}>{busy ? 'Generating package...' : 'Generate Ordered Review Package'}</button></footer>
    </section>}
  </div>;
}
