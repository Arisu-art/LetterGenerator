import type { LetterType } from './letter-engine';
import type { ExhibitKind } from './template-exhibits';
import {
  GENERATION_CONTRACT_VERSION,
  generationPacketOrderLabels,
  generationPacketOrderText,
  generationPacketPositions,
  generationRequiredExhibits,
  isContractFtcEnabled,
  type PacketContractPosition
} from './generation-contract';

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

function fromContract(position: PacketContractPosition): PacketPosition {
  return {
    id: position.role,
    number: position.sequence,
    label: position.label,
    exhibitKind: position.exhibitKind,
    editable: position.editable,
    required: position.required
  };
}

export function isFtcEnabled(): boolean {
  return isContractFtcEnabled();
}

export function getDisputePacketPositions(): PacketPosition[] {
  return generationPacketPositions('DISPUTE').map(fromContract);
}

export function getPacketPositions(type: LetterType): PacketPosition[] {
  return generationPacketPositions(type).map(fromContract);
}

export const latePaymentPacketPositions: PacketPosition[] = getPacketPositions('LATE_PAYMENT');
export const baseDisputePacketPositions: PacketPosition[] = getDisputePacketPositions().filter((position) => position.id !== 'FTC');
export const ftcPacketPosition: PacketPosition = fromContract({ role: 'FTC', sequence: 6, label: 'FTC Identity Theft Report', exhibitKind: 'FTC', editable: true, required: true, source: 'GENERATED_WORKFLOW' });

export const packetWorkflows: Record<LetterType, PacketWorkflow> = {
  DISPUTE: {
    type: 'DISPUTE',
    label: 'Dispute Packet',
    positions: getPacketPositions('DISPUTE')
  },
  LATE_PAYMENT: {
    type: 'LATE_PAYMENT',
    label: 'Late Payment Packet',
    positions: getPacketPositions('LATE_PAYMENT')
  }
};

export const workflowFramework: WorkflowFramework = {
  version: GENERATION_CONTRACT_VERSION,
  ftcEnabled: isFtcEnabled(),
  workflows: packetWorkflows
};

export function packetOrderLabels(type: LetterType): string[] {
  return generationPacketOrderLabels(type);
}

export function packetOrderText(type: LetterType): string {
  return generationPacketOrderText(type);
}

export function packetPositionCount(type: LetterType): number {
  return getPacketPositions(type).length;
}

export function exhibitKindsForPacket(type: LetterType): ExhibitKind[] {
  return generationRequiredExhibits(type);
}
