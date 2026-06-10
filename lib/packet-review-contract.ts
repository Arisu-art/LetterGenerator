import { isFtcEnabled } from './workflow-framework';
import type { PacketAssets } from './packet-assets';
import type { LetterRoute, LetterType } from './letter-engine';

export type PacketReviewDocumentRole = 'LETTER' | 'SUPPORTING' | 'ATTACHMENT' | 'FCRA' | 'AFFIDAVIT' | 'FTC';

export type PacketReviewDocument = {
  id: string;
  role: PacketReviewDocumentRole;
  sequence: number;
  label: string;
  detail: string;
  included: boolean;
  editable: boolean;
};

export type PacketReviewCard = {
  key: string;
  bureau: string;
  type: LetterType;
  title: string;
  subtitle: string;
  ready: boolean;
  reviewed: boolean;
  documents: PacketReviewDocument[];
};

export type PacketReviewSummary = {
  totalPackets: number;
  reviewedPackets: number;
  readyToDownload: boolean;
  cards: PacketReviewCard[];
  headline: string;
  instruction: string;
};

export type PacketReviewOutput = {
  path: string;
  type: LetterType;
  role?: 'LETTER' | 'AFFIDAVIT' | 'FTC';
  bureau: string;
};

function hasRole(outputs: PacketReviewOutput[], role: PacketReviewOutput['role']) {
  return outputs.some((output) => output.role === role);
}

function disputeDocuments(outputs: PacketReviewOutput[], supportingCount: number): PacketReviewDocument[] {
  const rows: PacketReviewDocument[] = [
    { id: '01', role: 'LETTER', sequence: 1, label: 'Dispute Letter', detail: 'Editable DOCX', included: true, editable: true },
    { id: '02', role: 'SUPPORTING', sequence: 2, label: 'Supporting Documents', detail: `${supportingCount} evidence file${supportingCount === 1 ? '' : 's'}`, included: supportingCount > 0, editable: false },
    { id: '03', role: 'ATTACHMENT', sequence: 3, label: 'Attachment', detail: 'Configured PDF insert', included: true, editable: false },
    { id: '04', role: 'FCRA', sequence: 4, label: 'FCRA Legal Exhibit', detail: 'Configured PDF insert', included: true, editable: false },
    { id: '05', role: 'AFFIDAVIT', sequence: 5, label: 'Affidavit', detail: 'Editable DOCX', included: hasRole(outputs, 'AFFIDAVIT'), editable: true }
  ];

  if (isFtcEnabled()) rows.push({ id: '06', role: 'FTC', sequence: 6, label: 'FTC Identity Theft Report', detail: 'Editable DOCX', included: hasRole(outputs, 'FTC'), editable: true });
  return rows;
}

function latePaymentDocuments(supportingCount: number): PacketReviewDocument[] {
  return [
    { id: '01', role: 'LETTER', sequence: 1, label: 'Late Payment Letter', detail: 'Editable DOCX', included: true, editable: true },
    { id: '02', role: 'SUPPORTING', sequence: 2, label: 'Supporting Documents', detail: `${supportingCount} evidence file${supportingCount === 1 ? '' : 's'}`, included: supportingCount > 0, editable: false }
  ];
}

export function buildPacketReviewSummary(input: {
  outputs: PacketReviewOutput[];
  reviewedPaths: string[];
  evidence?: PacketAssets;
  expectedRoutes?: LetterRoute[];
}): PacketReviewSummary {
  const supportingCount = input.evidence?.supporting.length || 0;
  const letters = input.outputs.filter((output) => !output.role || output.role === 'LETTER');
  const cards = letters
    .sort((a, b) => a.bureau.localeCompare(b.bureau) || a.type.localeCompare(b.type))
    .map((letter) => {
      const typeLabel = letter.type === 'LATE_PAYMENT' ? 'Late Payment' : 'Dispute';
      const documents = letter.type === 'DISPUTE' ? disputeDocuments(input.outputs, supportingCount) : latePaymentDocuments(supportingCount);
      return {
        key: letter.path,
        bureau: letter.bureau,
        type: letter.type,
        title: `${letter.bureau} ${typeLabel} Packet`,
        subtitle: documents.map((document) => `${document.id} ${document.label}`).join(' → '),
        ready: documents.every((document) => document.included),
        reviewed: input.reviewedPaths.includes(letter.path),
        documents
      } satisfies PacketReviewCard;
    });

  const reviewedPackets = cards.filter((card) => card.reviewed).length;
  return {
    totalPackets: cards.length,
    reviewedPackets,
    readyToDownload: cards.length > 0 && cards.every((card) => card.ready),
    cards,
    headline: 'Complete ordered package',
    instruction: cards.length
      ? `${cards.length} packet${cards.length === 1 ? '' : 's'} ready for live proofing. Review packets, then download the ordered ZIP.`
      : 'Generate a packet to begin live-proof review.'
  };
}
