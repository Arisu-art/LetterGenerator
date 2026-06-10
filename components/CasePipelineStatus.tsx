'use client';

import HeaderNextAction from './HeaderNextAction';
import type { CasePipelineStage, NextCaseAction } from '../lib/case-pipeline';
import { resolveHeaderNextAction } from '../lib/next-action-contract';

type Props = {
  stages: CasePipelineStage[];
  nextAction: NextCaseAction;
  status?: string;
  statusTone?: 'info' | 'success' | 'error';
};

export default function CasePipelineStatus({ stages, nextAction, status, statusTone }: Props) {
  return <HeaderNextAction action={resolveHeaderNextAction(stages, nextAction)} status={status} statusTone={statusTone} />;
}
