import { renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import type { Bureau, ParsedSource, SourceItem } from './letter-engine';

export type MappedAppendixKind = 'AFFIDAVIT' | 'FTC';
export type MappedAppendixContext = {
  kind: MappedAppendixKind;
  bureau: Bureau;
  documentDate: string;
  recipientName: string;
  recipientAddressLines: string[];
  source: ParsedSource;
};

function rows(items: SourceItem[]) {
  return items.map((item) => {
    const lines = item.displayText.split('\n').map((line) => line.trim()).filter(Boolean);
    const itemName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '');
    const itemNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '');
    return { account_name: itemName, account_number: itemNumber, account_line: [itemName, itemNumber].filter(Boolean).join(' - '), display_text: item.displayText };
  });
}

function mappedValues(context: MappedAppendixContext): PlaceholderValues {
  const accounts = rows(context.source.dispute[context.bureau]);
  const inquiries = context.source.inquiry[context.bureau].map((item) => ({ inquiry_line: item.displayText, display_text: item.displayText }));
  return {
    consumer_name: context.source.name,
    client_name: context.source.name,
    name: context.source.name,
    address: context.source.address.join('\n'),
    address_line_1: context.source.address[0] || '',
    address_line_2: context.source.address.slice(1).join(' '),
    dob: context.source.dob,
    ssn: context.source.ssn,
    phone: context.source.phone,
    email: context.source.email,
    date: context.documentDate,
    letter_date: context.documentDate,
    bureau_name: context.recipientName,
    bureau_address: context.recipientAddressLines.join('\n'),
    bureau_address_line_1: context.recipientAddressLines[0] || '',
    bureau_address_line_2: context.recipientAddressLines.slice(1).join(' '),
    accounts,
    dispute_accounts: accounts,
    hard_inquiries: inquiries,
    account_lines: accounts.map((item) => item.account_line).join('\n'),
    hard_inquiry_lines: inquiries.map((item) => item.inquiry_line).join('\n')
  };
}

export async function renderMappedAppendix(template: File, context: MappedAppendixContext) {
  return renderDocxTemplate(template, mappedValues(context));
}
