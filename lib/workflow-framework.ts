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

export type WorkflowFramework = {
  version: string;
  ftcEnabled: boolean;
  workflows: Record<LetterType, PacketWorkflow>;
};

export const latePaymentPacketPositions: PacketPosition[] = [
  { id: 'LETTER', number: 1, label: 'Late Payment Letter', format: 'DOCX', generated: true },
  { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', format: 'EVIDENCE', generated: false }
];

export const disputePacketPositions: PacketPosition[] = [
  { id: 'LETTER', number: 1, label: 'Dispute Letter', format: 'DOCX', generated: true },
  { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', format: 'EVIDENCE', generated: false },
  { id: 'FCRA', number: 3, label: 'FCRA Legal Exhibit', format: 'PDF', generated: false },
  { id: 'AFFIDAVIT', number: 4, label: 'Affidavit', format: 'DOCX', generated: true },
  { id: 'ATTACHMENT', number: 5, label: 'Attachment', format: 'PDF', generated: false },
  { id: 'FTC', number: 6, label: 'FTC Identity Theft Report', format: 'DOCX', generated: true }
];

export const packetWorkflows: Record<LetterType, PacketWorkflow> = {
  DISPUTE: {
    type: 'DISPUTE',
    label: 'Dispute Packet',
    positions: disputePacketPositions
  },
  LATE_PAYMENT: {
    type: 'LATE_PAYMENT',
    label: 'Late Payment Packet',
    positions: latePaymentPacketPositions
  }
};

export const packetTemplateByType = packetWorkflows;
export const activeWorkflowFoundation = packetWorkflows;
export const v3WorkflowFoundation = packetWorkflows;
export const workflowFoundation = packetWorkflows;

export function packetPositions(type: LetterType): PacketPosition[] {
  return packetWorkflows[type]?.positions || [];
}

export function activePacketTemplate(type: LetterType): PacketPosition[] {
  return packetPositions(type);
}

export function requiredPacketPositions(type: LetterType): PacketPosition[] {
  return packetPositions(type);
}

export function generatedPacketPositions(type: LetterType): PacketPosition[] {
  return packetPositions(type).filter((position) => position.generated);
}

export function packetOrderLabels(type: LetterType): string[] {
  return packetPositions(type).map((position) => {
    const suffix = position.format === 'EVIDENCE' ? '' : `.${position.format.toLowerCase()}`;
    return `${String(position.number).padStart(2, '0')} ${position.label}${suffix}`;
  });
}

export function packetOrderText(type: LetterType): string {
  return packetOrderLabels(type).join(' → ');
}

export function packetPositionCount(type: LetterType): number {
  return packetPositions(type).length;
}

export function packetStepById(type: LetterType, id: ActivePacketPosition): PacketPosition | undefined {
  return packetPositions(type).find((position) => position.id === id);
}

export function isFtcEnabled(): boolean {
  return false;
}

export function exhibitKindsForPacket(type: LetterType): ExhibitKind[] {
  return type === 'DISPUTE' ? ['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'] : [];
}

export function orderedPackageManifestLine(type: LetterType): string {
  return `${packetWorkflows[type].label}: ${packetOrderLabels(type).join('; ')}`;
}

export const workflowFramework = {
  version: 'v3',
  ftcEnabled: false,
  workflows: packetWorkflows
};

export const orderedPacketContract = {
  dispute: disputePacketPositions,
  latePayment: latePaymentPacketPositions,
  packetOrderLabels,
  packetOrderText,
  exhibitKindsForPacket
};
