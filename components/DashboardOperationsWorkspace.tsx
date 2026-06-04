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

type WorkflowStage = 'TEMPLATES' | 'SOURCE' | 'REVIEW' | 'DELIVERY';

const caseStatus: Record<ClientCaseStatus, string> = {
  SOURCE_LOCKED: 'Source ready',
  EVIDENCE_READY: 'Evidence ready',
  REVIEW_READY: 'Review ready',
  PDF_READY: 'PDF ready'
};

const workflowStages: Array<{ id: WorkflowStage; number: string; label: string }> = [
  { id: 'TEMPLATES', number: '01', label: 'Templates' },
  { id: 'SOURCE', number: '02', label: 'Source & Evidence' },
  { id: 'REVIEW', number: '03', label: 'Review' },
  { id: 'DELIVERY', number: '04', label: 'Delivery' }
];

function shortDate(value?: string) {
  return value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value)) : '—';
}

function statusTone(status: ClientCaseStatus) {
  return status === 'PDF_READY' ? 'ready' : status === 'REVIEW_READY' ? 'active' : 'neutral';
}

function currentStage(record: ClientCaseRecord | undefined): WorkflowStage {
  if (!record) return 'TEMPLATES';
  if (record.status === 'PDF_READY') return 'DELIVERY';
  if (record.status === 'REVIEW_READY') return 'REVIEW';
  return 'SOURCE';
}

function actionFor(record: ClientCaseRecord | undefined) {
  if (!record) return { title: 'Start a client case', copy: 'Configure approved templates, load source data, and assemble an ordered bureau packet.', button: 'Start New Case', target: 'new' as const };
  if (record.status === 'PDF_READY') return { title: 'Final packets ready for delivery', copy: `${record.clientName} has ${record.pdfCount} PDF packet${record.pdfCount === 1 ? '' : 's'} prepared for filing.`, button: 'Open Filing Tracker', target: 'tracker' as const };
  if (record.status === 'REVIEW_READY') return { title: 'Continue packet review', copy: `${record.clientName} has editable documents ready for human review and finalization.`, button: 'Open Outputs', target: 'outputs' as const };
  return { title: 'Complete source and evidence', copy: `${record.clientName} needs validated supporting material before document generation.`, button: 'Continue Case', target: 'case' as const };
}

export default function DashboardOperationsWorkspace({ cases, filings, activeCaseId, onNewCase, onOpenTemplates, onOpenOutputs, onOpenTracker, onContinueCase }: Props) {
  const activeCase = cases.find((record) => record.id === activeCaseId) || cases[0];
  const primary = actionFor(activeCase);
  const stage = currentStage(activeCase);
  const activeStageIndex = workflowStages.findIndex((item) => item.id === stage);
  const readyToSend = filings.filter((record) => record.status === 'PDF_READY');
  const sent = filings.filter((record) => record.status === 'SENT');
  const reviewCases = cases.filter((record) => record.status === 'REVIEW_READY');

  function executePrimary() {
    if (primary.target === 'new') onNewCase();
    else if (primary.target === 'tracker') onOpenTracker();
    else if (primary.target === 'outputs') onOpenOutputs();
    else if (activeCase) onContinueCase(activeCase);
  }

  function openStage(target: WorkflowStage) {
    if (target === 'TEMPLATES') onOpenTemplates();
    else if (target === 'SOURCE') activeCase ? onContinueCase(activeCase) : onNewCase();
    else if (target === 'REVIEW' && reviewCases.length) onOpenOutputs();
    else if (target === 'DELIVERY' && filings.length) onOpenTracker();
  }

  return <section className="saas-dashboard-workspace unified-client-dashboard">
    <section className="panel dashboard-command-card">
      <div className="dashboard-command-copy">
        <p className="eyebrow">Workflow command center</p>
        <h2>{primary.title}</h2>
        <p>{primary.copy}</p>
        <div className="dashboard-command-actions">
          <button type="button" className="action-button" onClick={executePrimary}>{primary.button}</button>
          {activeCase ? <button type="button" className="secondary-button" onClick={onNewCase}>New Case</button> : <button type="button" className="secondary-button" onClick={onOpenTemplates}>Review Templates</button>}
        </div>
      </div>
      {activeCase && <aside className="dashboard-active-case" aria-label="Active case">
        <p className="eyebrow">Active case</p>
        <strong>{activeCase.clientName}</strong>
        <span>{activeCase.round} · Updated {shortDate(activeCase.updatedAt)}</span>
        <div>
          <small>{caseStatus[activeCase.status]}</small>
          <small>{activeCase.bureaus.length} bureau{activeCase.bureaus.length === 1 ? '' : 's'}</small>
        </div>
        <button type="button" className="secondary-button" onClick={() => onContinueCase(activeCase)}>Resume case</button>
      </aside>}
    </section>

    <nav className="stepper" aria-label="Packet workflow stages">
      {workflowStages.map((item, index) => <button
        key={item.id}
        type="button"
        className={index < activeStageIndex ? 'complete' : index === activeStageIndex ? 'current' : ''}
        aria-current={index === activeStageIndex ? 'step' : undefined}
        disabled={(item.id === 'REVIEW' && !reviewCases.length) || (item.id === 'DELIVERY' && !filings.length)}
        onClick={() => openStage(item.id)}
      ><i>{index < activeStageIndex ? '✓' : item.number}</i><span>{item.label}</span></button>)}
    </nav>

    <div className="dashboard-operational-metrics" aria-label="Operational summary">
      <article><small>Client cases</small><strong>{cases.length}</strong><span>{reviewCases.length} awaiting review</span></article>
      <article className={readyToSend.length ? 'attention' : ''}><small>Ready to send</small><strong>{readyToSend.length}</strong><span>Final packet delivery</span></article>
      <article className="complete"><small>Sent packets</small><strong>{sent.length}</strong><span>Tracked delivery records</span></article>
    </div>

    <div className="dashboard-bottom-grid">
      <section className="panel dashboard-action-queue">
        <header><div><p className="eyebrow">Work queue</p><h3>Attention required</h3></div></header>
        <div className="queue-items">
          {readyToSend.length > 0 && <button type="button" className="queue-row urgent" onClick={onOpenTracker}><span>Delivery</span><strong>{readyToSend.length} PDF packet{readyToSend.length === 1 ? '' : 's'} ready to mark sent</strong><small>Open Tracker →</small></button>}
          {reviewCases.length > 0 && <button type="button" className="queue-row" onClick={onOpenOutputs}><span>Review</span><strong>{reviewCases.length} case{reviewCases.length === 1 ? '' : 's'} prepared for final PDF creation</strong><small>Open Outputs →</small></button>}
          {!readyToSend.length && !reviewCases.length && <div className="queue-row empty static-row"><span>Clear</span><strong>No pending delivery or review actions</strong><small>Up to date</small></div>}
        </div>
      </section>
      <section className="panel dashboard-recent-delivery">
        <header><div><p className="eyebrow">Delivery</p><h3>Recent packets</h3></div>{filings.length > 0 && readyToSend.length === 0 && <button type="button" className="text-action" onClick={onOpenTracker}>View tracker</button>}</header>
        {filings.length ? <div className="delivery-mini-list">{filings.slice(0, 4).map((record) => <article key={record.id}><div><strong>{record.clientName}</strong><span>{record.bureau} · {record.packetType === 'DISPUTE' ? 'Dispute' : 'Late Payment'}</span></div><small>{shortDate(record.sentAt || record.generatedAt)}</small><b className={record.status === 'SENT' ? 'sent' : ''}>{record.status === 'SENT' ? 'Sent' : 'PDF Ready'}</b></article>)}</div> : <div className="delivery-empty"><p>No final packet records yet.</p></div>}
      </section>
    </div>
    <section className="panel dashboard-case-portfolio">
      <header><div><p className="eyebrow">Client cases</p><h3>Case portfolio</h3><p>Resume active work or track finalized packet status.</p></div><span className="operations-count">{cases.length} case{cases.length === 1 ? '' : 's'}</span></header>
      {cases.length === 0 ? <div className="dashboard-cases-empty"><strong>No case records yet</strong><p>Begin from the primary action above.</p></div> : <div className="dashboard-case-list" role="list">{cases.map((record) => <article className={`dashboard-case-row ${record.id === activeCaseId ? 'current' : ''}`} key={record.id} role="listitem"><div className="dashboard-case-identity"><strong>{record.clientName}</strong><span>{record.round} · Updated {shortDate(record.updatedAt)}</span></div><div className="dashboard-case-stats"><span><b>{record.bureaus.length}</b> bureau</span><span><b>{record.evidenceCount}</b> evidence</span><span><b>{record.pdfCount}</b> PDF</span></div><em className={`operations-status ${statusTone(record.status)}`}>{caseStatus[record.status]}</em><button type="button" className="secondary-button" onClick={() => onContinueCase(record)}>{record.id === activeCaseId ? 'Continue' : record.status === 'PDF_READY' ? 'Track' : 'View'}</button></article>)}</div>}
    </section>
  </section>;
}
