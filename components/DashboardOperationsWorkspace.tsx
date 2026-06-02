'use client';

import type { ClientCaseRecord, FilingRecord } from '../lib/client-operations-store';

type Props = {
  cases: ClientCaseRecord[];
  filings: FilingRecord[];
  activeCaseId?: string;
  onNewCase: () => void;
  onOpenCases: () => void;
  onOpenTemplates: () => void;
  onOpenSource: () => void;
  onOpenOutputs: () => void;
  onOpenTracker: () => void;
};
function shortDate(value?: string) {
  return value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value)) : '—';
}
function actionFor(record: ClientCaseRecord | undefined) {
  if (!record) return { title: 'Start the first client case', copy: 'Load a source TXT file and produce an ordered bureau packet.', button: 'New Case', target: 'new' as const };
  if (record.status === 'PDF_READY') return { title: 'Final packets ready for delivery', copy: `${record.clientName} has ${record.pdfCount} PDF packet${record.pdfCount === 1 ? '' : 's'} prepared.`, button: 'Open Tracker', target: 'tracker' as const };
  if (record.status === 'REVIEW_READY') return { title: 'Continue packet review', copy: `${record.clientName} has editable documents ready for finalization.`, button: 'Open Outputs', target: 'outputs' as const };
  return { title: 'Continue source preparation', copy: `${record.clientName} needs evidence confirmation or review-package generation.`, button: 'Continue Case', target: 'source' as const };
}
export default function DashboardOperationsWorkspace({ cases, filings, activeCaseId, onNewCase, onOpenCases, onOpenTemplates, onOpenSource, onOpenOutputs, onOpenTracker }: Props) {
  const activeCase = cases.find((record) => record.id === activeCaseId) || cases[0];
  const primary = actionFor(activeCase);
  const readyToSend = filings.filter((record) => record.status === 'PDF_READY');
  const sent = filings.filter((record) => record.status === 'SENT');
  const reviewCases = cases.filter((record) => record.status === 'REVIEW_READY');
  function executePrimary() {
    if (primary.target === 'new') onNewCase();
    else if (primary.target === 'tracker') onOpenTracker();
    else if (primary.target === 'outputs') onOpenOutputs();
    else onOpenSource();
  }
  return <section className="saas-dashboard-workspace">
    <section className="panel dashboard-command-card">
      <div className="dashboard-command-copy"><p className="eyebrow">Next action</p><h2>{primary.title}</h2><p>{primary.copy}</p><div className="dashboard-command-actions"><button type="button" className="action-button" onClick={executePrimary}>{primary.button}</button><button type="button" className="secondary-button" onClick={onOpenCases}>All Cases</button></div></div>
      <aside className="dashboard-active-case" aria-label="Active case summary">{activeCase ? <><p className="eyebrow">Current case</p><strong>{activeCase.clientName}</strong><span>{activeCase.round} · {activeCase.bureaus.length} bureau{activeCase.bureaus.length === 1 ? '' : 's'}</span><div><small>{activeCase.evidenceCount} evidence</small><small>{activeCase.pdfCount} PDFs</small></div></> : <><p className="eyebrow">Setup</p><strong>No active case</strong><span>Configure packet references before beginning client work.</span><button type="button" className="secondary-button" onClick={onOpenTemplates}>Open Templates</button></>}</aside>
    </section>
    <div className="dashboard-operational-metrics" aria-label="Operational summary">
      <article><small>Client cases</small><strong>{cases.length}</strong><span>{reviewCases.length} awaiting review</span></article>
      <article className={readyToSend.length ? 'attention' : ''}><small>Ready to send</small><strong>{readyToSend.length}</strong><span>Final packet delivery</span></article>
      <article className="complete"><small>Sent packets</small><strong>{sent.length}</strong><span>Tracked delivery records</span></article>
    </div>
    <div className="dashboard-bottom-grid">
      <section className="panel dashboard-action-queue">
        <header><div><p className="eyebrow">Work queue</p><h3>Attention required</h3></div><button type="button" className="text-action" onClick={onOpenCases}>View cases</button></header>
        <div className="queue-items">{readyToSend.length > 0 && <button type="button" className="queue-row urgent" onClick={onOpenTracker}><span>Delivery</span><strong>{readyToSend.length} PDF packet{readyToSend.length === 1 ? '' : 's'} ready to mark sent</strong><small>Open Tracker →</small></button>}{reviewCases.length > 0 && <button type="button" className="queue-row" onClick={onOpenOutputs}><span>Review</span><strong>{reviewCases.length} case{reviewCases.length === 1 ? '' : 's'} prepared for final PDF creation</strong><small>Open Outputs →</small></button>}{!readyToSend.length && !reviewCases.length && <button type="button" className="queue-row empty" onClick={onNewCase}><span>Ready</span><strong>No pending delivery or review actions</strong><small>Start Case →</small></button>}</div>
      </section>
      <section className="panel dashboard-recent-delivery">
        <header><div><p className="eyebrow">Delivery</p><h3>Recent packets</h3></div><button type="button" className="text-action" onClick={onOpenTracker}>Tracker</button></header>
        {filings.length ? <div className="delivery-mini-list">{filings.slice(0, 4).map((record) => <article key={record.id}><div><strong>{record.clientName}</strong><span>{record.bureau} · {record.packetType === 'DISPUTE' ? 'Dispute' : 'Late Payment'}</span></div><small>{shortDate(record.sentAt || record.generatedAt)}</small><b className={record.status === 'SENT' ? 'sent' : ''}>{record.status === 'SENT' ? 'Sent' : 'PDF Ready'}</b></article>)}</div> : <div className="delivery-empty"><p>No final packet records yet.</p><button type="button" className="secondary-button" onClick={onNewCase}>New Case</button></div>}
      </section>
    </div>
  </section>;
}
