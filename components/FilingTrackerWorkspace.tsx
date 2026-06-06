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

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function packetLabel(record: FilingRecord) {
  return record.packetType === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet';
}

export default function FilingTrackerWorkspace({
  records,
  outputsAvailable,
  onReturnToOutputs,
  onStartCase,
  onMarkSent
}: Props) {
  const ready = records.filter((record) => record.status === 'PDF_READY').length;
  const sent = records.filter((record) => record.status === 'SENT').length;
  const active = records.length - sent;

  return (
    <section className="filing-tracker-workspace operations-workspace saas-dashboard-shell">
      <header className="saas-hero">
        <div>
          <p className="eyebrow">Client operations</p>
          <h2>Filing tracker</h2>
          <p>
            Track generated bureau packets from review-ready status to sent delivery without exposing backend workflow details.
          </p>
        </div>

        <div className="operations-actions">
          {outputsAvailable && (
            <button type="button" className="secondary-button" onClick={onReturnToOutputs}>
              Open Outputs
            </button>
          )}
          <button type="button" className="action-button" onClick={onStartCase}>
            New Case
          </button>
        </div>
      </header>

      <div className="saas-metric-grid operations-metrics" aria-label="Filing status summary">
        <article className="saas-metric-card">
          <span>Total Packets</span>
          <strong>{records.length}</strong>
          <p>Tracked filing records</p>
        </article>

        <article className="saas-metric-card">
          <span>Ready</span>
          <strong>{ready}</strong>
          <p>Packets ready to send</p>
        </article>

        <article className="saas-metric-card">
          <span>Active</span>
          <strong>{active}</strong>
          <p>Open delivery items</p>
        </article>

        <article className="saas-metric-card complete">
          <span>Sent</span>
          <strong>{sent}</strong>
          <p>Completed deliveries</p>
        </article>
      </div>

      <section className="panel operations-table-surface saas-panel">
        <header className="operations-section-head">
          <div>
            <p className="eyebrow">Delivery queue</p>
            <h3>Client packet delivery</h3>
            <p>Review each generated packet status and mark delivery as sent when complete.</p>
          </div>
          <span className="operations-count">
            {records.length} filing{records.length === 1 ? '' : 's'}
          </span>
        </header>

        {records.length === 0 ? (
          <div className="operations-empty">
            <strong>No packets tracked yet</strong>
            <p>Generate a packet package first, then return here to track delivery status.</p>
            <button type="button" className="action-button" onClick={onStartCase}>
              Start Case
            </button>
          </div>
        ) : (
          <div className="filing-records" role="list">
            {records.map((record) => (
              <article key={record.id} className="filing-record" role="listitem">
                <div className="filing-identity">
                  <strong>{record.clientName}</strong>
                  <span>
                    {record.bureau} · {packetLabel(record)}
                  </span>
                </div>

                <div className="filing-date">
                  <small>Generated</small>
                  <strong>{formatDate(record.generatedAt)}</strong>
                </div>

                <div className="filing-date">
                  <small>Sent</small>
                  <strong>{formatDate(record.sentAt)}</strong>
                </div>

                <span className={`operations-status ${record.status === 'SENT' ? 'ready' : 'active'}`}>
                  {record.status === 'SENT' ? 'Sent' : 'Ready'}
                </span>

                {record.status === 'PDF_READY' ? (
                  <button type="button" className="secondary-button" onClick={() => onMarkSent(record.id)}>
                    Mark sent
                  </button>
                ) : (
                  <span className="filing-complete">Complete</span>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
