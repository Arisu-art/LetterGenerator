import { isFeatureEnabled } from './feature-flags';
import type { LetterType, SourceItem } from './letter-engine';
import type { ExhibitKind } from './template-exhibits';

export const GENERATION_CONTRACT_VERSION = '2.0.0';

export type PacketRole = 'LETTER' | 'SUPPORTING' | 'ATTACHMENT' | 'FCRA' | 'AFFIDAVIT' | 'FTC';
export type RenderedItemKind = 'DISPUTE_ACCOUNT' | 'HARD_INQUIRY' | 'LATE_PAYMENT';

export type PacketContractPosition = {
  role: PacketRole;
  sequence: number;
  label: string;
  required: boolean;
  editable: boolean;
  source: 'LETTER_TEMPLATE' | 'BROWSER_WORKSPACE' | 'EXHIBIT_TEMPLATE' | 'GENERATED_WORKFLOW';
  exhibitKind?: ExhibitKind;
};

export type RenderRule = {
  itemKind: RenderedItemKind;
  sectionAnchor: string;
  lineStylePolicy: 'TEMPLATE_ITEM_STYLE';
  statementPolicy: 'IDENTITY_THEFT_LEGAL_STATEMENT' | 'NONE';
  statementColor: 'RED' | 'TEMPLATE';
  keepTogether: boolean;
};

export type GenerationContract = {
  version: typeof GENERATION_CONTRACT_VERSION;
  ftcEnabled: boolean;
  packetPositions: Record<LetterType, PacketContractPosition[]>;
  renderRules: Record<RenderedItemKind, RenderRule>;
};

const disputeBasePositions: PacketContractPosition[] = [
  { role: 'LETTER', sequence: 1, label: 'Dispute Letter', required: true, editable: true, source: 'LETTER_TEMPLATE' },
  { role: 'SUPPORTING', sequence: 2, label: 'Supporting Documents', required: true, editable: false, source: 'BROWSER_WORKSPACE' },
  { role: 'ATTACHMENT', sequence: 3, label: 'Attachment', required: true, editable: false, source: 'EXHIBIT_TEMPLATE', exhibitKind: 'ATTACHMENT' },
  { role: 'FCRA', sequence: 4, label: 'FCRA Legal Exhibit', required: true, editable: false, source: 'EXHIBIT_TEMPLATE', exhibitKind: 'FCRA' },
  { role: 'AFFIDAVIT', sequence: 5, label: 'Affidavit', required: true, editable: true, source: 'EXHIBIT_TEMPLATE', exhibitKind: 'AFFIDAVIT' }
];

const ftcPosition: PacketContractPosition = {
  role: 'FTC',
  sequence: 6,
  label: 'FTC Identity Theft Report',
  required: true,
  editable: true,
  source: 'GENERATED_WORKFLOW',
  exhibitKind: 'FTC'
};

const latePaymentPositions: PacketContractPosition[] = [
  { role: 'LETTER', sequence: 1, label: 'Late Payment Letter', required: true, editable: true, source: 'LETTER_TEMPLATE' },
  { role: 'SUPPORTING', sequence: 2, label: 'Supporting Documents', required: true, editable: false, source: 'BROWSER_WORKSPACE' }
];

export const generationRenderRules: Record<RenderedItemKind, RenderRule> = {
  DISPUTE_ACCOUNT: {
    itemKind: 'DISPUTE_ACCOUNT',
    sectionAnchor: 'DISPUTE ACCOUNTS / FRAUDULENT ACCOUNTS',
    lineStylePolicy: 'TEMPLATE_ITEM_STYLE',
    statementPolicy: 'IDENTITY_THEFT_LEGAL_STATEMENT',
    statementColor: 'RED',
    keepTogether: true
  },
  HARD_INQUIRY: {
    itemKind: 'HARD_INQUIRY',
    sectionAnchor: 'HARD INQUIRIES',
    lineStylePolicy: 'TEMPLATE_ITEM_STYLE',
    statementPolicy: 'IDENTITY_THEFT_LEGAL_STATEMENT',
    statementColor: 'RED',
    keepTogether: true
  },
  LATE_PAYMENT: {
    itemKind: 'LATE_PAYMENT',
    sectionAnchor: 'LATE PAYMENTS',
    lineStylePolicy: 'TEMPLATE_ITEM_STYLE',
    statementPolicy: 'NONE',
    statementColor: 'TEMPLATE',
    keepTogether: true
  }
};

export function isContractFtcEnabled() {
  return isFeatureEnabled('FTC_IDENTITY_THEFT_REPORT');
}

export function disputePacketPositions() {
  return isContractFtcEnabled() ? [...disputeBasePositions, ftcPosition] : disputeBasePositions;
}

export function generationPacketPositions(type: LetterType) {
  return type === 'DISPUTE' ? disputePacketPositions() : latePaymentPositions;
}

export function generationRequiredExhibits(type: LetterType): ExhibitKind[] {
  return generationPacketPositions(type)
    .filter((position) => position.required && position.exhibitKind)
    .map((position) => position.exhibitKind!);
}

export function generationPacketOrderLabels(type: LetterType) {
  return generationPacketPositions(type).map((position) => `${String(position.sequence).padStart(2, '0')} ${position.label}`);
}

export function generationPacketOrderText(type: LetterType) {
  return generationPacketOrderLabels(type).join(' → ');
}

export function generationContract(): GenerationContract {
  return {
    version: GENERATION_CONTRACT_VERSION,
    ftcEnabled: isContractFtcEnabled(),
    packetPositions: {
      DISPUTE: generationPacketPositions('DISPUTE'),
      LATE_PAYMENT: generationPacketPositions('LATE_PAYMENT')
    },
    renderRules: generationRenderRules
  };
}

export function itemsByContract(items: SourceItem[]) {
  return {
    disputeAccounts: items.filter((item) => item.type === 'DISPUTE_ACCOUNT'),
    hardInquiries: items.filter((item) => item.type === 'HARD_INQUIRY'),
    latePayments: items.filter((item) => item.type === 'LATE_PAYMENT')
  };
}
