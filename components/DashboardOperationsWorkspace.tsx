'use client';

import type { ClientCaseRecord, ClientCaseStatus, FilingRecord } from '../lib/client-operations-store';

type Props = {
  cases: ClientCaseRecord[];
  filings: FilingRecord[];
  activeCaseId?: string;
  onNewCase: () => void;
  onOpenTemplates: () => void;
  onOpenSource?: () => void;
  onOpenOutputs: () => void;
  onOpenTracker: () => void;
  onContinueCase: (record: ClientCaseRecord) => void;
};

const caseStatus: Record<ClientCaseStatus, string> = {
  SOURCE_LOCKED: 'Source ready',
  EVIDENCE_READY: 'Evidence ready',
  REVIEW_READY: 'Review ready',
  PDF_READY: 'Ready to deliver'
};

function shortDate(value?: string) {
  return value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value)) : '—';
}

function statusTone(status: ClientCaseStatus) {
  return status === 'PDF_READY' ? 'ready' : status === 'REVIEW_READY' ? 'active' : 'neutral';
}

function actionFor(record: ClientCaseRecord | undefined) {
  if (!record) return { title: 'Start a client packet', copy: 'Create the workspace, upload templates, import source data, and generate the ordered package.', button: 'Start Case', target: 'new' as const };
  if (record.status === 'PDF_READY') return { title: 'Package ready for handoff', copy: `${record.clientName} is ready for final delivery tracking.`, button: 'Open Delivery Center', target: 'tracker' as const };
  if (record.status === 'REVIEW_READY') return { title: 'Review generated package', copy: `${record.clientName} has editable documents ready for review and download.`, button: 'Open Outputs', target: 'outputs' as const };
  return { title: 'Continue active packet', copy: `${record.clientName} is in ${record.round}. Continue the required workflow steps.`, button: 'Continue Case', target: 'case' as const };
}

function packetType(record: FilingRecord) {
  return record.packetType === 'DISPUTE' ? 'Dispute' : 'Late Payment';
}

export default function DashboardOperationsWorkspace({ cases, filings, activeCaseId, onNewCase, onOpenTemplates, onOpenSource, onOpenOutputs, onOpenTracker, onContinueCase }: Props) {
  const activeCase = cases.find((record) => record.id === activeCaseId) || cases[0];
  const primary = actionFor(activeCase);
  const readyToSend = filings.filter((record) => record.status === 'PDF_READY');
  const sent = filings.filter((record) => record.status === 'SENT');
  const reviewCases = cases.filter((record) => record.status === 'REVIEW_READY');
  const recentCases = cases.slice(0, 4);

  function executePrimary() {
    if (primary.target === 'new') onNewCase();
    else if (primary.target === 'tracker') onOpenTracker();
    else if (primary.target === 'outputs') onOpenOutputs();
    else if (activeCase) onContinueCase(activeCase);
  }

  return <section className="saas-dashboard-workspace unified-client-dashboard minimal-workflow-dashboard">
    <section className="panel dashboard-command-card dashboard-command-single">
      <div className="dashboard-command-copy">
        <p className="eyebrow">Command Center</p>
        <h2>{primary.title}</h2>
        <p>{primary.copy}</p>
        <div className="dashboard-command-actions">
          <button type="button" className="action-button" onClick={executePrimary}>{primary.button}</button>
          <button type="button" className="secondary-button" onClick={onOpenTemplates}>Templates</button>
          <button type="button" className="secondary-button" onClick={onOpenSource || onNewCase}>Source Data</button>
        </div>
      </div>
    </section>

    <div className="dashboard-operational-metrics" aria-label="Workflow summary">
      <article><small>Active cases</small><strong>{cases.length}</strong><span>{reviewCases.length} ready for review</span></article>
      <article className={readyToSend.length ? 'attention' : ''}><small>Delivery handoff</small><strong>{readyToSend.length}</strong><span>Ready to send</span></article>
      <article className="complete"><small>Completed delivery</small><strong>{sent.length}</strong><span>Marked sent</span></article>
    </div>

    <div className="dashboard-bottom-grid">
      <section className="panel dashboard-action-queue">
        <header><div><p className="eyebrow">Next best action</p><h3>Workflow queue</h3></div></header>
        <div className="queue-items">
          {readyToSend.length > 0 && <button type="button" className="queue-row urgent" onClick={onOpenTracker}><span>Deliver</span><strong>{readyToSend.length} packet{readyToSend.length === 1 ? '' : 's'} ready for handoff</strong><small>Open Delivery Center →</small></button>}
          {reviewCases.length > 0 && <button type="button" className="queue-row" onClick={onOpenOutputs}><span>Review</span><strong>{reviewCases.length} case{reviewCases.length === 1 ? '' : 's'} ready for output review</strong><small>Open Outputs →</small></button>}
          {cases.length === 0 && <button type="button" className="queue-row" onClick={onNewCase}><span>Start</span><strong>No active client case yet</strong><small>Start Case →</small></button>}
          {!readyToSend.length && !reviewCases.length && cases.length > 0 && <div className="queue-row empty static-row"><span>Clear</span><strong>No blocked review or delivery action</strong><small>Continue active case when ready</small></div>}
        </div>
      </section>

      <section className="panel dashboard-recent-delivery">
        <header><div><p className="eyebrow">Delivery</p><h3>Recent handoff</h3></div>{filings.length > 0 && <button type="button" className="text-action" onClick={onOpenTracker}>Open</button>}</header>
        {filings.length ? <div className="delivery-mini-list">{filings.slice(0, 4).map((record) => <article key={record.id}><div><strong>{record.clientName}</strong><span>{record.bureau} · {packetType(record)}</span></div><small>{shortDate(record.sentAt || record.generatedAt)}</small><b className={record.status === 'SENT' ? 'sent' : ''}>{record.status === 'SENT' ? 'Sent' : 'Ready'}</b></article>)}</div> : <div className="delivery-empty"><p>No delivery records yet.</p></div>}
      </section>
    </div>

    <section className="panel dashboard-case-portfolio">
      <header><div><p className="eyebrow">Case resume</p><h3>Recent client work</h3><p>Resume only the most relevant active work. Full delivery history stays in Delivery Center.</p></div><span className="operations-count">{cases.length} case{cases.length === 1 ? '' : 's'}</span></header>
      {cases.length === 0 ? <div className="dashboard-cases-empty"><strong>No case records yet</strong><p>Start a case, then this dashboard becomes your resume point.</p></div> : <div className="dashboard-case-list" role="list">{recentCases.map((record) => <article className={`dashboard-case-row ${record.id === activeCaseId ? 'current' : ''}`} key={record.id} role="listitem"><div className="dashboard-case-identity"><strong>{record.clientName}</strong><span>{record.round} · Updated {shortDate(record.updatedAt)}</span></div><div className="dashboard-case-stats"><span><b>{record.bureaus.length}</b> bureau</span><span><b>{record.evidenceCount}</b> evidence</span><span><b>{record.editableCount}</b> docs</span></div><em className={`operations-status ${statusTone(record.status)}`}>{caseStatus[record.status]}</em><button type="button" className="secondary-button" onClick={() => onContinueCase(record)}>{record.id === activeCaseId ? 'Continue' : record.status === 'PDF_READY' ? 'Deliver' : 'Resume'}</button></article>)}</div>}
    </section>
  </section>;
}
