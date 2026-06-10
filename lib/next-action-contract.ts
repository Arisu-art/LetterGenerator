import type { CasePipelineStage, NextCaseAction } from './case-pipeline';

export type HeaderNextAction = {
  progressLabel: string;
  title: string;
  detail: string;
  targetPanel: CasePipelineStage['targetPanel'];
  state: 'ready' | 'blocked' | 'active' | 'complete';
};

function shortTitle(title: string) {
  return title
    .replace(/^Add templates$/i, 'Add templates')
    .replace(/^Import source data$/i, 'Import source')
    .replace(/^Attach evidence$/i, 'Add evidence')
    .replace(/^Ready check$/i, 'Fix readiness')
    .replace(/^Generate packet$/i, 'Generate')
    .replace(/^Review output$/i, 'Review packets')
    .replace(/^Download ZIP$/i, 'Download')
    .replace(/^Track filing$/i, 'Track filing')
    .replace(/^Start case$/i, 'Start case');
}

function compactDetail(detail: string) {
  return detail
    .replace(/Open Templates and complete the required files\.?/i, 'Upload the required templates.')
    .replace(/Open Source Data and import the client TXT\.?/i, 'Import the client source file.')
    .replace(/Add supporting documents in Source Data\.?/i, 'Attach supporting documents.')
    .replace(/Resolve remaining readiness checks\.?/i, 'Fix the required readiness item.')
    .replace(/Generate the packet from Source Data\.?/i, 'Generate the ordered packet.')
    .replace(/Open Outputs and review generated packets\.?/i, 'Review generated packets.')
    .replace(/Download the ordered package ZIP\.?/i, 'Download the final ZIP.')
    .replace(/Open Filing Tracker after mailing or submitting\.?/i, 'Track filing after delivery.');
}

export function resolveHeaderNextAction(stages: CasePipelineStage[], nextAction: NextCaseAction): HeaderNextAction {
  const required = stages.filter((stage) => stage.required);
  const done = required.filter((stage) => stage.done).length;
  const progressLabel = required.length ? `${done}/${required.length}` : '0/0';
  const active = stages.find((stage) => stage.id === nextAction.stageId) || stages.find((stage) => !stage.done);
  const complete = required.length > 0 && done === required.length;

  if (complete) {
    return {
      progressLabel: 'Ready',
      title: 'Workflow ready',
      detail: 'Review, download, and track filing when ready.',
      targetPanel: 'Outputs',
      state: 'complete'
    };
  }

  return {
    progressLabel,
    title: shortTitle(nextAction.title),
    detail: compactDetail(nextAction.detail),
    targetPanel: nextAction.targetPanel,
    state: active?.status === 'blocked' ? 'blocked' : 'active'
  };
}
