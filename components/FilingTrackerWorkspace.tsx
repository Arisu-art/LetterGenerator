'use client';

import type { FilingRecord } from '../lib/client-operations-store';

type Props = {
  records: FilingRecord[];
  outputsAvailable: boolean;
  onReturnToOutputs: () => void;
  onStartCase: () => void;
  onMarkSent: (id: string) => void;
};

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function packetLabel(record: FilingRecord) {
  return record.packetType === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet';
}

function nextDeliveryStep(records: FilingRecord[], outputsAvailable: boolean) {
  const ready = records.some((record) => record.status === 'PDF_READY');
  if (ready) return 'Send ready packets, then mark each packet as sent.';
  if (outputsAvailable) return 'Open Outputs to review and download the final package.';
  return 'Generate a package first, then return here for delivery handoff.';
}

export default function FilingTrackerWorkspace({ records, outputsAvailable, onReturnToOutputs, onStartCase, onMarkSent }: Props) {
  const ready = records.filter((record) => record.status === 'PDF_READY').length;
  const sent = records.filter((record) => record.status === 'SENT').length;
  const open = records.length - sent;
  const completion = records.length ? Math.round((sent / records.length) * 100) : 0;

  return <section className="filing-tracker-workspace operations-workspace saas-dashboard-shell">
    <section className="panel operations-table-surface saas-panel">
      <header className="operations-section-head">
        <div>
          <p className="eyebrow">Delivery Center</p>
          <h3>Final package handoff</h3>
          <p>{nextDeliveryStep(records, outputsAvailable)}</p>
        </div>
        <div className="operations-actions">
          {outputsAvailable && <button type="button" className="secondary-button" onClick={onReturnToOutputs}>Open Outputs</button>}
          <button type="button" className="action-button" onClick={onStartCase}>New Case</button>
        </div>
      </header>

      <div className="saas-metric-grid operations-metrics" aria-label="Delivery readiness summary">
        <article className="saas-metric-card">
          <span>Ready to send</span>
          <strong>{ready}</strong>
          <p>Packets waiting for delivery</p>
        </article>
        <article className="saas-metric-card">
          <span>Open handoff</span>
          <strong>{open}</strong>
          <p>Packets not yet marked sent</p>
        </article>
        <article className="saas-metric-card complete">
          <span>Delivered</span>
          <strong>{sent}</strong>
          <p>{completion}% completion</p>
        </article>
      </div>

      {records.length === 0 ? <div className="operations-empty">
        <strong>No delivery handoff yet</strong>
        <p>Generate and review a package. This center will show the final send queue for each bureau packet.</p>
        {outputsAvailable ? <button type="button" className="action-button" onClick={onReturnToOutputs}>Open Outputs</button> : <button type="button" className="action-button" onClick={onStartCase}>Start Case</button>}
      </div> : <div className="filing-records" role="list">
        {records.map((record) => <article key={record.id} className="filing-record" role="listitem">
          <div className="filing-identity">
            <strong>{record.clientName}</strong>
            <span>{record.bureau} · {packetLabel(record)}</span>
          </div>
          <div className="filing-date"><small>Prepared</small><strong>{formatDate(record.generatedAt)}</strong></div>
          <div className="filing-date"><small>Sent</small><strong>{formatDate(record.sentAt)}</strong></div>
          <span className={`operations-status ${record.status === 'SENT' ? 'ready' : 'active'}`}>{record.status === 'SENT' ? 'Sent' : 'Ready'}</span>
          {record.status === 'PDF_READY' ? <button type="button" className="secondary-button" onClick={() => onMarkSent(record.id)}>Mark sent</button> : <span className="filing-complete">Complete</span>}
        </article>)}
      </div>}
    </section>
  </section>;
}
