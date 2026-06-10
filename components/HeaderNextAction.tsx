'use client';

import type { HeaderNextAction as HeaderNextActionModel } from '../lib/next-action-contract';

type Props = {
  action: HeaderNextActionModel;
  status?: string;
  statusTone?: 'info' | 'success' | 'error';
};

export default function HeaderNextAction({ action, status, statusTone = 'info' }: Props) {
  const hasStatus = Boolean(status?.trim());
  return <div className={`header-next-action ${action.state} ${hasStatus ? `with-status ${statusTone}` : ''}`} aria-label="Next workflow action">
    <span>{action.progressLabel}</span>
    <div>
      {hasStatus && <small className="header-chip-status" role={statusTone === 'error' ? 'alert' : 'status'} aria-live="polite">{status}</small>}
      <strong>{action.title}</strong>
      <small>{action.detail}</small>
    </div>
  </div>;
}
