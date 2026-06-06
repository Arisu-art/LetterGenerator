import type { LetterType } from './letter-engine';
import type { ExhibitKind } from './template-exhibits';

export type ActivePacketPosition = 'LETTER' | 'SUPPORTING' | 'FCRA' | 'FTC' | 'AFFIDAVIT' | 'ATTACHMENT';
export type PacketPosition = {
  id: ActivePacketPosition;
  number: number;
  label: string;
  format: 'DOCX' | 'PDF' | 'EVIDENCE';
  generated: boolean;
};

const DISPUTE_PACKET: readonly PacketPosition[] = [
  { id: 'LETTER', number: 1, label: 'Dispute Letter', format: 'DOCX', generated: true },
  { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', format: 'EVIDENCE', generated: true },
  { id: 'FCRA', number: 3, label: 'FCRA Legal Exhibit', format: 'PDF', generated: false },
  { id: 'FTC', number: 4, label: 'FTC Identity Theft Report', format: 'DOCX', generated: true },
  { id: 'AFFIDAVIT', number: 5, label: 'Affidavit', format: 'DOCX', generated: true },
  { id: 'ATTACHMENT', number: 6, label: 'Attachment', format: 'PDF', generated: false }
];
const LATE_PAYMENT_PACKET: readonly PacketPosition[] = [
  { id: 'LETTER', number: 1, label: 'Late Payment Letter', format: 'DOCX', generated: true },
  { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', format: 'EVIDENCE', generated: true }
];

/**
 * The single application policy for document order and enabled capabilities.
 * UI components and document assembly must consume this policy instead of
 * restating packet order or disabled-document behavior independently.
 */
export const workflowFramework = {
  version: '3.0-foundation',
  productName: 'LetterGenerator',
  disabledCapabilities: {
    FTC: {
      enabled: true,
      reason: 'FTC Identity Theft Report generation is enabled through the V3 generated-document strategy.'
    }
  },
  activeDisputeExhibits: ['FCRA', 'AFFIDAVIT', 'ATTACHMENT'] as readonly ExhibitKind[]
} as const;

export function packetPositions(type: LetterType): readonly PacketPosition[] {
  return type === 'DISPUTE' ? DISPUTE_PACKET : LATE_PAYMENT_PACKET;
}
export function packetOrderLabels(type: LetterType): string[] {
  return packetPositions(type).map((position) => `${String(position.number).padStart(2, '0')} ${position.label}`);
}
export function packetOrderText(type: LetterType): string {
  return packetPositions(type).map((position) => position.label).join(' → ');
}
export function packetPositionCount(type: LetterType): number {
  return packetPositions(type).length;
}
export function activeExhibitKinds(): ExhibitKind[] {
  return [...workflowFramework.activeDisputeExhibits];
}
export function isFtcEnabled(): boolean {
  return workflowFramework.disabledCapabilities.FTC.enabled;
}
