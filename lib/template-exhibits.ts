import { inspectTemplateContract, type TemplateContract } from './template-contracts';
import { isFeatureEnabled } from './feature-flags';

export type ExhibitKind = 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';
export type ActiveExhibitKind = ExhibitKind;
export type ExhibitMode = 'STATIC_PDF' | 'GENERATED_DOCX';
export type ExhibitAsset = { id: string; kind: ExhibitKind; mode: ExhibitMode; name: string; type: string; size: number; contract?: TemplateContract };
export type TemplateExhibits = Record<ExhibitKind, ExhibitAsset | null>;

const DB_NAME = 'lettergenerator-private-templates';
const STORE_NAME = 'files';
const META_PREFIX = 'lettergenerator.template-exhibits.v2.';
const LEGACY_PREFIX = 'lettergenerator.template-exhibits.v1.';

export