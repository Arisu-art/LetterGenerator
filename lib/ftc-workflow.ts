import { buildFtcAffectedAccounts, renderFtcIdentityTheftReportDocx, type FtcAffectedAccount } from './ftc-report-renderer';
import type { ParsedSource } from './letter-engine';
import { readTemplateExhibit } from './template-exhibits';

export const FTC_PACKET_ROLE = 'FTC' as const;
export const FTC_PACKET_BUREAU = 'CLIENT' as const;
export const FTC_PACKET_SEQUENCE = 6;
export const FTC_PACKET_LABEL = 'FTC Identity Theft Report';
export const FTC_PACKET_FILENAME = '06 FTC Identity Theft Report.docx';

export type FtcWorkflowReviewOutput = {
  id: string;
  path: string;
  type: 'DISPUTE';
  role: typeof FTC_PACKET_ROLE;
  sequence: typeof FTC_PACKET_SEQUENCE;
  bureau: typeof FTC_PACKET_BUREAU;
  count: number;
  detail: string;
  blob: Blob;
  packetSteps: string[];
};

export type GenerateFtcWorkflowInput = {
  round: string;
  parsed: ParsedSource;
  date: string;
  cleanName: (value: string) => string;
  packetSteps: string[];
};

export type GenerateFtcWorkflowResult = {
  output: FtcWorkflowReviewOutput;
  notes: string[];
  accounts: FtcAffectedAccount[];
};

export function buildFtcWorkflowSource(parsed: ParsedSource) {
  const accounts = buildFtcAffectedAccounts(parsed);

  return {
    source: { ...parsed, ftcAccounts: accounts },
    accounts,
    notes: accounts.length
      ? []
      : ['FTC Identity Theft Report: no affected accounts were detected; generated with an empty review section.']
  };
}

export function ftcOutputPath(clientName: string, cleanName: (value: string) => string) {
  return `Editable Documents/${cleanName(clientName)} ${FTC_PACKET_FILENAME}`;
}

export async function generateFtcWorkflowOutput(input: GenerateFtcWorkflowInput): Promise<GenerateFtcWorkflowResult> {
  const template = await readTemplateExhibit(input.round, 'FTC');

  if (!template) {
    throw new Error('Required component missing: 06 FTC Identity Theft Report DOCX template is not uploaded.');
  }

  const workflow = buildFtcWorkflowSource(input.parsed);
  const blob = await renderFtcIdentityTheftReportDocx(workflow.source, input.date, template);

  return {
    accounts: workflow.accounts,
    notes: workflow.notes,
    output: {
      id: 'CLIENT-FTC-IDENTITY-THEFT-REPORT',
      path: ftcOutputPath(input.parsed.name, input.cleanName),
      type: 'DISPUTE',
      role: FTC_PACKET_ROLE,
      sequence: FTC_PACKET_SEQUENCE,
      bureau: FTC_PACKET_BUREAU,
      count: workflow.accounts.length,
      detail: `${workflow.accounts.length} affected FTC item(s)`,
      blob,
      packetSteps: input.packetSteps
    }
  };
}

export function isFtcReviewOutput(output: { role?: string; sequence?: number; path?: string }) {
  return output.role === FTC_PACKET_ROLE || output.sequence === FTC_PACKET_SEQUENCE || /FTC Identity Theft Report/i.test(output.path || '');
}
