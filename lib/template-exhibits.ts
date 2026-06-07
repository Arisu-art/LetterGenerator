import { inspectTemplateContract, type TemplateContract } from './template-contracts';

export type ExhibitKind = 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';
export type ActiveExhibitKind = ExhibitKind;
export type ExhibitMode = 'STATIC_PDF' | 'GENERATED_DOCX';
export type ExhibitAsset = { id: string; kind: ExhibitKind; mode: ExhibitMode; name: string; type: string; size: number; contract?: TemplateContract };
export type TemplateExhibits = Record<ExhibitKind, Exhibit