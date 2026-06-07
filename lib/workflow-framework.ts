import type { LetterType } from './letter-engine';
import type { ExhibitKind } from './template-exhibits';

export type ActivePacketPosition = 'LETTER' | 'SUPPORTING' | 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';

export type PacketPosition = {
  id: ActivePacketPosition;
  number: number;
  label: string;
  format: 'DOCX' | 'PDF' | 'EVIDENCE';
  generated: boolean;
};

export type PacketWorkflow = {
  type: LetterType;
  label: string;
  positions: PacketPosition[];
};

export type WorkflowFramework = {
  version: string;
  ftcEnabled: boolean;
  workflows: Record<LetterType, PacketWorkflow>;
};

export const latePaymentPacketPositions: PacketPosition[] = [
  { id: 'LETTER', number: 1, label: 'Late Payment Letter', format: 'DOCX', generated: true },
  { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', format: 'EVIDENCE', generated: false }