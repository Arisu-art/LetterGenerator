'use client';

import type { ClientCaseRecord, ClientCaseStatus } from '../lib/client-operations-store';

type Props = {
  records: ClientCaseRecord[];
  activeCaseId?: string;
  onContinue: (record: ClientCaseRecord) => void;
  onOpenTracker: () => void;
  onCreateCase: () => void;
};
const statusLabel: Record<ClientCaseStatus, string> = {
  SOURCE_LOCKED: 'Source ready',
  EVIDENCE_READY: 'Evidence ready',
  REVIEW_READY: 'Review ready',
  PDF_READY: 'PDF ready'
};
function when(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
function tone(status: ClientCaseStatus) { return status === 'PDF_READY' ? 'ready' : status === 'REVIEW_READY' ? 'active' : 'neutral'; }

export default function ClientCasesWorkspace({ records, activeCaseId, onContinue, onOpenTracker, onCreateCase }: Props) {
  const ready = records.filter((record) => record.status === 'PDF_READY').length;
  const inProgress = records.length - ready;
  return <section className="clients-cases-workspace operations-workspace">
    <section className="panel operations-command">
      <div className="operations-heading"><p className="eyebrow">Client operations</p><h2>Clients & Cases</h2><p>Continue active packet work and open completed cases for filing follow-up.</p></div>
      <div className="operations-actions"><button type="button" className="secondary-button" onClick={onOpenTracker}>Filing Tracker</button><button type="button" className="action-button" onClick={onCreateCase}>New Case</button></div>
    </section>
    <div className="operations-metrics" aria-label="Case status summary">
      <article><small>Active cases</small><strong>{records.length}</strong></article>
      <article><small>In progress</small><strong>{inProgress}</strong></article>
      <article className="complete"><small>PDF ready</small><strong>{ready}</strong></article>
    </div>
    <section className="panel operations-table-surface">
      <header className="operations-section-head"><div><h3>Case workspace</h3><p>Each case retains round, bureau coverage and delivery status.</p></div><span className="operations-count">{records.length} case{records.length === 1 ? '' : 's'}</span></header>
      {records.length === 0 ? <div className="operations-empty"><strong>No client cases yet</strong><p>Load a client source file to create the first case record.</p><button type="button" className="action-button" onClick={onCreateCase}>Load Source Data</button></div> : <div className="case-records" role="list">{records.map((record) => <article key={record.id} className={`case-record ${record.id === activeCaseId ? 'current' : ''}`} role="listitem">
        <div className="case-identity"><strong>{record.clientName}</strong><span>{record.round} · Updated {when(record.updatedAt)}</span></div>
        <div className="case-facts"><span><b>{record.bureaus.length}</b> Bureaus</span><span><b>{record.evidenceCount}</b> Evidence</span><span><b>{record.pdfCount}</b> PDFs</span></div>
        <span className={`operations-status ${tone(record.status)}`}>{statusLabel[record.status]}</span>
        <button type="button" className="secondary-button" onClick={() => onContinue(record)}>{record.id === activeCaseId ? 'Continue' : 'View status'}</button>
      </article>)}</div>}
    </section>
  </section>;
}
