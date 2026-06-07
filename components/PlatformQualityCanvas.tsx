'use client';

import { packetOrderText, workflowFramework } from '../lib/workflow-framework';
import { getFeatureDisabledReason, isFeatureEnabled } from '../lib/feature-flags';

const pillars = [
  {
    title: 'One workflow contract',
    status: 'Implemented',
    body: 'Packet order and active capabilities are declared once and consumed across new workflow surfaces.'
  },
  {
    title: 'Failure-safe execution',
    status: 'Implemented',
    body: 'Document operations expose progress and the application recovers cleanly from unexpected UI failure.'
  },
  {
    title: 'Document engine isolation',
    status: 'Next upgrade',
    body: 'Move document conversion behind typed jobs and automated validation fixtures.'
  },
  {
    title: 'Design system consolidation',
    status: 'Next upgrade',
    body: 'Replace accumulated style overrides with shared components, tokens and one page-shell hierarchy.'
  }
] as const;

export default function PlatformQualityCanvas() {
  return (
    <section className="panel platform-quality-canvas" aria-label="Platform quality canvas">
      <header className="platform-canvas-header">
        <div>
          <p className="eyebrow">Workflow Framework V3</p>
          <h3>Platform quality canvas</h3>
          <p>Professional control model for generation reliability, interface consistency and future replacement features.</p>
        </div>
        <span className="platform-canvas-version">{workflowFramework.version}</span>
      </header>
      <div className="platform-canvas-contract">
        <small>Active dispute packet contract</small>
        <strong>{packetOrderText('DISPUTE')}</strong>
        <span>{isFeatureEnabled('FTC_IDENTITY_THEFT_REPORT') ? 'FTC Identity Theft Report is active.' : `FTC: ${getFeatureDisabledReason('FTC_IDENTITY_THEFT_REPORT')}`}</span>
      </div>
      <div className="platform-canvas-grid">
        {pillars.map((pillar) => (
          <article key={pillar.title}>
            <span className={pillar.status === 'Implemented' ? 'complete' : 'planned'}>{pillar.status}</span>
            <h4>{pillar.title}</h4>
            <p>{pillar.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
