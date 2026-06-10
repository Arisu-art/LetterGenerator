'use client';

import type { CasePipelineStage, NextCaseAction } from '../lib/case-pipeline';

type Props = {
  stages: CasePipelineStage[];
  nextAction: NextCaseAction;
};

export default function CasePipelineStatus({ stages, nextAction }: Props) {
  return <section className="panel case-pipeline-shell">
    <div className="case-pipeline-header">
      <div>
        <p className="eyebrow">Case pipeline</p>
        <h2>Professional workflow</h2>
        <p>Follow the packet workflow with a clear next step.</p>
      </div>
    </div>
    <div className="next-action-card">
      <p className="eyebrow">Next step</p>
      <h3>{nextAction.title}</h3>
      <p>{nextAction.detail}</p>
    </div>
  </section>;
}
