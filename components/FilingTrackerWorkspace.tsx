'use client';

import type { FilingRecord } from '../lib/client-operations-store';

type Props = {
  records: FilingRecord[];
  outputsAvailable: boolean;
  onReturnToOutputs: () => void;
  onStartCase: () => void;
  onMarkSent: (id: string) => void;
};
function when(value?: string) {
  return value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
}
export default function FilingTrackerWorkspace({ records, outputsAvailable, onReturnToOutputs, onStartCase, onMarkSent }: Props) {
  const ready = records.filter((record) => record.status === 'PDF_READY').length;
  const sent = records.filter((record) => record.status === 'SENT').length;
  return <section className="filing-tracker-workspace operations-workspace">
    <section className="panel operations-command">
      <div className="operations-heading"><p className="eyebrow">Delivery operations</p><h2>Track packet delivery</h2><p>Move final bureau packets from PDF-ready to sent with one clear status record.</p></div>
      <div className="operations-actions">{outputsAvailable && <button type="button" className="secondary-button" onClick={onReturnToOutputs}>Open Outputs</button>}<button type="button" className="action-button" onClick={onStartCase}>New Case</button></div>
    </section>
    <div className="operations-metrics" aria-label="Filing status summary">
      <article><small>Packets</small><strong>{records.length}</strong></article>
      <article><small>Ready to send</small><strong>{ready}</strong></article>
      <article className="complete"><small>Sent</small><strong>{sent}</strong></article>
    </div>
    <section className="panel operations-table-surface">
      <header className="operations-section-head"><div><h3>Delivery queue</h3><p>Final packet delivery status by bureau.</p></div><span className="operations-count">{records.length} filing{records.length === 1 ? '' : 's'}</span></header>
      {records.length === 0 ? <div className="operations-empty"><strong>No final packets tracked</strong><p>Create final PDFs from an active case to begin tracking.</p><button type="button" className="action-button" onClick={onStartCase}>Start Case</button></div> : <div className="filing-records" role="list">{records.map((record) => <article key={record.id} className="filing-record" role="listitem">
        <div className="filing-identity"><strong>{record.clientName}</strong><span>{record.bureau} · {record.packetType === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</span></div>
        <div className="filing-date"><small>Generated</small><strong>{when(record.generatedAt)}</strong></div>
        <div className="filing-date"><small>Sent</small><strong>{when(record.sentAt)}</strong></div>
        <span className={`operations-status ${record.status === 'SENT' ? 'ready' : 'active'}`}>{record.status === 'SENT' ? 'Sent' : 'PDF ready'}</span>
        {record.status === 'PDF_READY' ? <button type="button" className="secondary-button" onClick={() => onMarkSent(record.id)}>Mark sent</button> : <span className="filing-complete">Complete</span>}
      </article>)}</div>}
    </section>
  </section>;
}
