import type { LetterRoute } from './letter-engine';
import type { PacketAssets } from './packet-assets';
import type { LetterReference, Round } from './reference-store';
import type { TemplateExhibits } from './template-exhibits';
import type { GenerationPreflightResult } from './preflight-validation';

export const CASE_PIPELINE_VERSION = '1.0.0';

export type CasePipelineStageId =
  | 'START_CASE'
  | 'TEMPLATES_READY'
  | 'SOURCE_READY'
  | 'EVIDENCE_READY'
  | 'PREFLIGHT_READY'
  | 'PACKET_GENERATED'
  | 'REVIEWED'
  | 'DOWNLOADED'
  | 'FILED';

export type CasePipelineStatus = 'done' | 'active' | 'blocked' | 'upcoming';

export type CasePipelineStage = {
  id: CasePipelineStageId;
  number: number;
  label: string;
  userLabel: string;
  done: boolean;
  required: boolean;
  status: CasePipelineStatus;
  detail: string;
  nextAction: string;
  targetPanel: 'Dashboard' | 'Templates' | 'Source Data' | 'Outputs' | 'Filing Tracker' | 'Settings';
};

export type CasePipelineContext = {
  round: Round;
  hasCase: boolean;
  clientName: string;
  routes: LetterRoute[];
  references: LetterReference[];
  templates: TemplateExhibits;
  evidence: PacketAssets;
  preflight: GenerationPreflightResult;
  outputCount: number;
  orderedZipReady: boolean;
  reviewedCount?: number;
  downloaded?: boolean;
  filedCount?: number;
};

export type NextCaseAction = {
  stageId: CasePipelineStageId;
  title: string;
  detail: string;
  actionLabel: string;
  targetPanel: CasePipelineStage['targetPanel'];
};

function requiredTemplateKinds(context: CasePipelineContext) {
  const hasDispute = context.routes.some((route) => route.type === 'DISPUTE');
  if (!hasDispute) return [];
  return ['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'] as const;
}

function hasRequiredTemplates(context: CasePipelineContext) {
  const routeTypes = Array.from(new Set(context.routes.map((route) => route.type)));
  const hasLetters = routeTypes.length > 0 && routeTypes.every((type) => context.references.some((slot) => slot.round === context.round && slot.type === type && Boolean(slot.file)));
  const requiredExhibits = requiredTemplateKinds(context);
  const hasExhibits = requiredExhibits.every((kind) => Boolean(context.templates[kind]));
  return hasLetters && hasExhibits;
}

function stageStatus(done: boolean, active: boolean, blocked: boolean): CasePipelineStatus {
  if (done) return 'done';
  if (blocked) return 'blocked';
  if (active) return 'active';
  return 'upcoming';
}

export function buildCasePipeline(context: CasePipelineContext): CasePipelineStage[] {
  const templatesReady = hasRequiredTemplates(context);
  const sourceReady = context.routes.length > 0 && Boolean(context.clientName);
  const evidenceReady = context.evidence.supporting.length > 0;
  const preflightReady = context.preflight.ready;
  const packetGenerated = context.orderedZipReady && context.outputCount > 0;
  const reviewed = packetGenerated || Boolean(context.reviewedCount && context.reviewedCount > 0);
  const downloaded = packetGenerated || Boolean(context.downloaded);
  const filed = Boolean(context.filedCount && context.filedCount > 0);

  const stages: Omit<CasePipelineStage, 'status'>[] = [
    {
      id: 'START_CASE',
      number: 1,
      label: 'Start',
      userLabel: 'Start case',
      done: context.hasCase,
      required: true,
      detail: context.hasCase ? `${context.clientName || 'Client'} case is open for ${context.round}.` : 'Create or import a client case to begin.',
      nextAction: 'Start a new case or import a workspace snapshot.',
      targetPanel: 'Dashboard'
    },
    {
      id: 'TEMPLATES_READY',
      number: 2,
      label: 'Templates',
      userLabel: 'Add templates',
      done: templatesReady,
      required: true,
      detail: templatesReady ? 'Required letter and packet templates are configured.' : 'Upload the active round letter templates and required packet templates.',
      nextAction: 'Open Templates and complete the required files.',
      targetPanel: 'Templates'
    },
    {
      id: 'SOURCE_READY',
      number: 3,
      label: 'Source',
      userLabel: 'Import source data',
      done: sourceReady,
      required: true,
      detail: sourceReady ? `${context.routes.length} packet route(s) detected from source data.` : 'Import and standardize the client source TXT.',
      nextAction: 'Open Source Data and import the client TXT.',
      targetPanel: 'Source Data'
    },
    {
      id: 'EVIDENCE_READY',
      number: 4,
      label: 'Evidence',
      userLabel: 'Attach evidence',
      done: evidenceReady,
      required: true,
      detail: evidenceReady ? `${context.evidence.supporting.length} supporting document image(s) attached.` : 'Add supporting document images before generation.',
      nextAction: 'Add supporting documents in Source Data.',
      targetPanel: 'Source Data'
    },
    {
      id: 'PREFLIGHT_READY',
      number: 5,
      label: 'Preflight',
      userLabel: 'Ready check',
      done: preflightReady,
      required: true,
      detail: preflightReady ? 'Generation requirements passed.' : context.preflight.summary,
      nextAction: context.preflight.blockers[0]?.detail || 'Resolve remaining readiness checks.',
      targetPanel: 'Source Data'
    },
    {
      id: 'PACKET_GENERATED',
      number: 6,
      label: 'Generate',
      userLabel: 'Generate packet',
      done: packetGenerated,
      required: true,
      detail: packetGenerated ? `${context.outputCount} generated document(s) are ready.` : 'Generate the complete ordered packet package.',
      nextAction: 'Generate the packet from Source Data.',
      targetPanel: 'Source Data'
    },
    {
      id: 'REVIEWED',
      number: 7,
      label: 'Review',
      userLabel: 'Review output',
      done: reviewed,
      required: true,
      detail: reviewed ? 'Packet review is available in Outputs.' : 'Open each generated packet for review.',
      nextAction: 'Open Outputs and review generated packets.',
      targetPanel: 'Outputs'
    },
    {
      id: 'DOWNLOADED',
      number: 8,
      label: 'Download',
      userLabel: 'Download ZIP',
      done: downloaded,
      required: true,
      detail: downloaded ? 'Final ZIP is ready to download.' : 'Download the final ordered package ZIP.',
      nextAction: 'Download the ordered package ZIP.',
      targetPanel: 'Outputs'
    },
    {
      id: 'FILED',
      number: 9,
      label: 'File',
      userLabel: 'Track filing',
      done: filed,
      required: false,
      detail: filed ? `${context.filedCount} filing record(s) tracked.` : 'Track sent packet status after delivery.',
      nextAction: 'Open Filing Tracker after mailing or submitting.',
      targetPanel: 'Filing Tracker'
    }
  ];

  const firstOpenIndex = stages.findIndex((stage) => stage.required && !stage.done);
  return stages.map((stage, index) => ({
    ...stage,
    status: stageStatus(stage.done, index === firstOpenIndex, index < firstOpenIndex ? false : stage.required && !stage.done && index === firstOpenIndex)
  }));
}

export function nextCaseAction(stages: CasePipelineStage[]): NextCaseAction {
  const next = stages.find((stage) => stage.required && !stage.done) || stages.find((stage) => !stage.done) || stages[stages.length - 1];
  return {
    stageId: next.id,
    title: next.done ? 'Case workflow is complete' : next.userLabel,
    detail: next.done ? next.detail : next.nextAction,
    actionLabel: next.done ? 'View filing tracker' : `Go to ${next.targetPanel}`,
    targetPanel: next.targetPanel
  };
}
