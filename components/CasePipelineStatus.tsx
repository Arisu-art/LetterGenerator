'use client';

import type { CasePipelineStage, NextCaseAction } from '../lib/case-pipeline';

type Props = {
  stages: CasePipelineStage[];
  nextAction: NextCaseAction;
};

export default function CasePipelineStatus({ stages, nextAction }: Props) {
  const required = stages.filter((stage) => stage.required);
  const done = required.filter((stage) => stage.done).length;
  const active = stages.find((stage) => stage.status === 'active' || stage.status === 'blocked') || stages.find((stage) => !stage.done) || stages[0];
  const ready = required.length > 0 && done === required.length;

  return <div className={`case-pipeline-compact ${ready ? 'done' : active?.status || 'upcoming'}`} aria-label="Case pipeline status">
    <span>{done}/{required.length}</span>
    <div>
      <strong>{ready ? 'Workflow ready' : nextAction.title}</strong>
      <small>{ready ? 'Review, download, and track filing when ready.' : nextAction.detail}</small>
    </div>
  </div>;
}
