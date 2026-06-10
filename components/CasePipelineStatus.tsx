'use client';

import HeaderNextAction from './HeaderNextAction';
import type { CasePipelineStage, NextCaseAction } from '../lib/case-pipeline';
import { resolveHeaderNextAction } from '../lib/next-action-contract';

type Props = {
  stages: CasePipelineStage[];
  nextAction: NextCaseAction;
};

export default function CasePipelineStatus({ stages, nextAction }: Props) {
  return <HeaderNextAction action={resolveHeaderNextAction(stages, nextAction)} />;
}
