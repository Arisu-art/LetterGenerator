import { isFeatureEnabled, shouldProcessFeature } from './feature-flags';
import type { LetterType } from './letter-engine';
import type { ExhibitKind } from './template-exhibits';

export type ActivePacketPosition = 'LETTER' | 'SUPPORTING' | 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';

export type PacketPosition = {
  id: ActivePacketPosition;
  number: number;
  label: string;
  exhibitKind?: ExhibitKind;
  editable: boolean;
  required: boolean;
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
  { id: 'LETTER', number: 1, label: 'Late Payment Letter', editable: true, required: true },
  { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', editable: false, required: true }
];

export const baseDisputePacketPositions: PacketPosition[] = [
  { id: 'LETTER', number: 1, label: 'Dispute Letter', editable: true, required: true },
  { id: 'SUPPORTING', number: 2, label: 'Supporting Documents', editable: false, required: true },
  { id: 'FCRA', number: 3, label: 'FCRA Legal Exhibit', exhibitKind: 'FCRA', editable: false, required: true },
  { id: 'AFFIDAVIT', number: 4, label: 'Affidavit', exhibitKind: 'AFFIDAVIT', editable: true, required: true },
  { id: 'ATTACHMENT', number: 5, label: 'Attachment', exhibitKind: 'ATTACHMENT', editable: false, required: true }
];

export const ftcPacketPosition: PacketPosition = {
  id: 'FTC',
  number: 6,
  label: 'FTC Identity Theft Report',
  exhibitKind: 'FTC',
  editable: true,
  required: true
};

export function isFtcEnabled(): boolean {
  return isFeatureEnabled('FTC_IDENTITY_THEFT_REPORT');
}

export function getDisputePacketPositions(): PacketPosition[] {
  const positions = [...baseDisputePacketPositions];

  if (shouldProcessFeature('FTC_IDENTITY_THEFT_REPORT')) {
    positions.push(ftcPacketPosition);
  }

  return positions;
}

export function getPacketPositions(type: LetterType): PacketPosition[] {
  return type === 'DISPUTE' ? getDisputePacketPositions() : latePaymentPacketPositions;
}

export const packetWorkflows: Record<LetterType, PacketWorkflow> = {
  DISPUTE: {
    type: 'DISPUTE',
    label: 'Dispute Packet',
    positions: getDisputePacketPositions()
  },
  LATE_PAYMENT: {
    type: 'LATE_PAYMENT',
    label: 'Late Payment Packet',
    positions: latePaymentPacketPositions
  }
};

export const workflowFramework: WorkflowFramework = {
  version: '1.0.0',
  ftcEnabled: isFtcEnabled(),
  workflows: packetWorkflows
};

export function packetOrderLabels(type: LetterType): string[] {
  return getPacketPositions(type).map((position) => `${String(position.number).padStart(2, '0')} ${position.label}`);
}

export function packetOrderText(type: LetterType): string {
  return packetOrderLabels(type).join(' → ');
}

export function packetPositionCount(type: LetterType): number {
  return getPacketPositions(type).length;
}

export function exhibitKindsForPacket(type: LetterType): ExhibitKind[] {
  const kinds: ExhibitKind[] = [];

  for (const position of getPacketPositions(type)) {
    if (position.exhibitKind) {
      kinds.push(position.exhibitKind);
    }
  }

  return kinds;
}
