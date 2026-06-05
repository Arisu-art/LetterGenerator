import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { hasTemplateInjectionTags, requireTemplateInjectionTags } from './template-injection';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DISPUTE_EXCLUDED_ADDRESS_FIELD = /^(?:PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE|EMAIL|E-?MAIL|COUNTRY|DOB|SSN)\s*:/i;
const TOKEN = /\{\{\s*[#\/^]?\s*[\w.-]+\s*\}\}/g;

export type TemplateValue = string | number | boolean | Array<Record<string, string>>;
export type PlaceholderValues = Record<string, TemplateValue>;
export type ReferenceDisputeValues = {
  consumerName: string;
  addressLines: string[];
  dob: string;
  ssn: string;
  letterDate: string;
  bureauName: string;
  bureauAddressLines: string[];
  disputeItems?: string[];
  /** Rendered as inquiry rows only; no HARD INQUIRIES label is emitted. */
  hardInquiryItems?: string[];
  fraudItems?: string[];
};

export async function renderDocxTemplate(template: File, values: PlaceholderValues): Promise<Blob> {
  const zip = new PizZip(await template.arrayBuffer());
  const document = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => ''
  });
  document.render(values);
  return document.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

function visibleXmlText(xml: string) {
  return xml
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
function canonical(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function resolved(values: ReferenceDisputeValues) {
  if (values.disputeItems || values.hardInquiryItems) return { accounts: values.disputeItems || [], inquiries: values.hardInquiryItems || [] };
  const combined = values.fraudItems || [];
  return {
    accounts: combined.filter((entry) => /^(Account|Creditor)\s+Name\s*:/i.test(entry.trim())),
    inquiries: combined.filter((entry) => !/^(Account|Creditor)\s+Name\s*:/i.test(entry.trim()))
  };
}
function disputeAddressLines(values: ReferenceDisputeValues) {
  return values.addressLines.map((line) => line.trim()).filter(Boolean).filter((line) => !DISPUTE_EXCLUDED_ADDRESS_FIELD.test(line));
}
function accountValues(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^(?:Account|Creditor)\s+Name\s*:/i.test(line)) || '').replace(/^(?:Account|Creditor)\s+Name\s*:\s*/i, '');
  const accountNumber = (lines.find((line) => /^Account\s+Number\s*:/i.test(line)) || '').replace(/^Account\s+Number\s*:\s*/i, '');
  return { account_name: accountName, account_number: accountNumber, account_line: [accountName, accountNumber].filter(Boolean).join(' - '), display_text: text };
}
function disputePlaceholderValues(values: ReferenceDisputeValues): PlaceholderValues {
  const source = resolved(values);
  const address = disputeAddressLines(values);
  const accounts = source.accounts.map(accountValues);
  const inquiries = source.inquiries.map((text) => ({ inquiry_line: text, display_text: text }));
  return {
    consumer_name: values.consumerName,
    client_name: values.consumerName,
    name: values.consumerName,
    address: address.join('\n'),
    address_inline: address.join(' '),
    address_line_1: address[0] || '',
    address_line_2: address.slice(1).join(' '),
    dob: values.dob,
    ssn: values.ssn,
    ssn_masked: values.ssn,
    date: values.letterDate,
    letter_date: values.letterDate,
    document_date: values.letterDate,
    bureau_name: values.bureauName,
    bureau_address: values.bureauAddressLines.join('\n'),
    bureau_address_line_1: values.bureauAddressLines[0] || '',
    bureau_address_line_2: values.bureauAddressLines.slice(1).join(' '),
    accounts,
    dispute_accounts: accounts,
    hard_inquiries: inquiries,
    account_lines: accounts.map((item) => item.display_text).join('\n\n'),
    hard_inquiry_lines: source.inquiries.join('\n')
  };
}
async function validateStrictDisputeOutput(blob: Blob, values: ReferenceDisputeValues) {
  const xml = new PizZip(await blob.arrayBuffer()).file('word/document.xml')?.asText() || '';
  const output = visibleXmlText(xml);
  if (TOKEN.test(output)) throw new Error('Dispute output contains unresolved template placeholders. Check mapped tags/zones in the uploaded DOCX.');
  if (!canonical(output).includes(canonical(values.consumerName))) throw new Error(`Dispute output consumer integrity check failed: expected ${values.consumerName}.`);
  if (!canonical(output).includes(canonical(values.bureauName))) throw new Error(`Dispute output bureau integrity check failed: expected ${values.bureauName}.`);
  if (!canonical(output).includes(canonical(values.letterDate))) throw new Error(`Dispute output document-date integrity check failed: expected ${values.letterDate}.`);
  return blob;
}

export async function renderReferenceDisputeDocx(reference: File, values: ReferenceDisputeValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('DOCX document XML is unavailable.');
  const documentXml = file.asText();
  requireTemplateInjectionTags(documentXml, 'Dispute letter');
  if (!hasTemplateInjectionTags(documentXml)) throw new Error('Dispute letter template has no mapped source-data placeholders.');
  return validateStrictDisputeOutput(await renderDocxTemplate(reference, disputePlaceholderValues(values)), values);
}
export function isDocx(filename: string) { return /\.docx$/i.test(filename); }
