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
  SOURCE_LOCKED: 'Continue setup',
  EVIDENCE_READY: 'Ready to generate',
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
  if (!record) return { title: 'Start a client packet', copy: 'Create one workspace and continue through templates, source data, outputs, and delivery.', button: 'Start Case', target: 'new' as const };
  if (record.status === 'PDF_READY') return { title: 'Package ready for delivery', copy: `${record.clientName} is ready for final handoff.`, button: 'Open Delivery Center', target: 'tracker' as const };
  if (record.status === 'REVIEW_READY') return { title: 'Review generated package', copy: `${record.clientName} has documents ready in Outputs.`, button: 'Open Outputs', target: 'outputs' as const };
  return { title: 'Continue active packet', copy: `${record.clientName} is in ${record.round}.`, button: 'Continue Case', target: 'case' as const };
}

export default function DashboardOperationsWorkspace({ cases, filings, activeCaseId, onNewCase, onOpenTemplates, onOpenOutputs, onOpenTracker, onContinueCase }: Props) {
  const activeCase = cases.find((record) => record.id === activeCaseId) || cases[0];
  const primary = actionFor(activeCase);
  const readyToSend = filings.filter((record) => record.status === 'PDF_READY');
  const reviewCases = cases.filter((record) => record.status === 'REVIEW_READY');
  const recentCases = cases.slice(0, 3);

  function executePrimary() {
    if (primary.target === 'new') onNewCase();
    else if (primary.target === 'tracker') onOpenTracker();
    else if (primary.target === 'outputs') onOpenOutputs();
    else if (activeCase) onContinueCase(activeCase);
  }

  return <section className="saas-dashboard-workspace unified-client-dashboard minimal-workflow-dashboard">
    <section className="panel dashboard-command-card dashboard-command-single compact-dashboard-command">
      <div className="dashboard-command-copy">
        <p className="eyebrow">Command Center</p>
        <h2>{primary.title}</h2>
        <p>{primary.copy}</p>
        <div className="dashboard-command-actions">
          <button type="button" className="action-button" onClick={executePrimary}>{primary.button}</button>
          <button type="button" className="secondary-button" onClick={onOpenTemplates}>Templates</button>
        </div>
      </div>
    </section>

    <div className="dashboard-operational-metrics compact-dashboard-metrics" aria-label="Workflow summary">
      <article><small>Cases</small><strong>{cases.length}</strong><span>Active workspaces</span></article>
      <article className={reviewCases.length ? 'attention' : ''}><small>Review</small><strong>{reviewCases.length}</strong><span>Ready in Outputs</span></article>
      <article className={readyToSend.length ? 'attention' : 'complete'}><small>Delivery</small><strong>{readyToSend.length}</strong><span>Ready to send</span></article>
    </div>

    {(readyToSend.length > 0 || reviewCases.length > 0 || cases.length === 0) && <section className="panel dashboard-action-queue compact-dashboard-queue">
      <header><div><p className="eyebrow">Next action</p><h3>What needs attention</h3></div></header>
      <div className="queue-items">
        {readyToSend.length > 0 && <button type="button" className="queue-row urgent" onClick={onOpenTracker}><span>Deliver</span><strong>{readyToSend.length} packet{readyToSend.length === 1 ? '' : 's'} ready for handoff</strong><small>Open Delivery Center →</small></button>}
        {reviewCases.length > 0 && <button type="button" className="queue-row" onClick={onOpenOutputs}><span>Review</span><strong>{reviewCases.length} case{reviewCases.length === 1 ? '' : 's'} ready for output review</strong><small>Open Outputs →</small></button>}
        {cases.length === 0 && <button type="button" className="queue-row" onClick={onNewCase}><span>Start</span><strong>No active client case yet</strong><small>Start Case →</small></button>}
      </div>
    </section>}

    <section className="panel dashboard-case-portfolio compact-case-portfolio">
      <header><div><p className="eyebrow">Resume</p><h3>Recent work</h3></div>{cases.length > 3 && <span className="operations-count">Latest 3</span>}</header>
      {cases.length === 0 ? <div className="dashboard-cases-empty"><strong>No case records yet</strong><p>Start a case, then this dashboard becomes your resume point.</p></div> : <div className="dashboard-case-list compact-case-list" role="list">{recentCases.map((record) => <article className={`dashboard-case-row compact-case-row ${record.id === activeCaseId ? 'current' : ''}`} key={record.id} role="listitem"><div className="dashboard-case-identity"><strong>{record.clientName}</strong><span>{record.round} · {shortDate(record.updatedAt)}</span></div><em className={`operations-status ${statusTone(record.status)}`}>{caseStatus[record.status]}</em><button type="button" className="secondary-button" onClick={() => onContinueCase(record)}>{record.id === activeCaseId ? 'Continue' : record.status === 'PDF_READY' ? 'Deliver' : 'Resume'}</button></article>)}</div>}
    </section>
  </section>;
}
