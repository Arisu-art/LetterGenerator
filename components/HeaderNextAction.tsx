'use client';

import type { HeaderNextAction as HeaderNextActionModel } from '../lib/next-action-contract';

type Props = {
  action: HeaderNextActionModel;
};

export default function HeaderNextAction({ action }: Props) {
  return <div className={`header-next-action ${action.state}`} aria-label="Next workflow action">
    <span>{action.progressLabel}</span>
    <div>
      <strong>{action.title}</strong>
      <small>{action.detail}</small>
    </div>
  </div>;
}
