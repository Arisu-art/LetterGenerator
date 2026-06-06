import PizZip from 'pizzip';
import { renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import { requireTemplateInjectionTags } from './template-injection';

const TOKEN = /\{\{\s*[#\/^]?\s*[\w.-]+\s*\}\}/g;

export type LateReferenceValues = {
  consumerName: string;
  addressLines: string[];
  dob: string;
  ssn: string;
  letterDate: string;
  bureauName: string;
  bureauAddressLines: string[];
  latePaymentItems: string[];
};

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
function itemValue(value: string) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^(?:Account|Creditor)\s+Name\s*:/i.test(line)) || '').replace(/^(?:Account|Creditor)\s+Name\s*:\s*/i, '');
  const accountNumber = (lines.find((line) => /^Account\s+Number\s*:/i.test(line)) || '').replace(/^Account\s+Number\s*:\s*/i, '');
  return { account_name: accountName, account_number: accountNumber, display_text: value, account_line: [accountName, accountNumber].filter(Boolean).join(' - ') };
}
function placeholderValues(values: LateReferenceValues): PlaceholderValues {
  const items = values.latePaymentItems.map(itemValue);
  return {
    consumer_name: values.consumerName,
    client_name: values.consumerName,
    name: values.consumerName,
    address: values.addressLines.join('\n'),
    address_inline: values.addressLines.join(' '),
    address_line_1: values.addressLines[0] || '',
    address_line_2: values.addressLines.slice(1).join(' '),
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
    accounts: items,
    late_accounts: items,
    late_payment_accounts: items,
    account_lines: values.latePaymentItems.join('\n\n')
  };
}
async function validateGenerated(blob: Blob, values: LateReferenceValues) {
  const xml = new PizZip(await blob.arrayBuffer()).file('word/document.xml')?.asText() || '';
  const output = visibleXmlText(xml);
  if (TOKEN.test(output)) throw new Error('Late Payment output contains unresolved template placeholders. Check mapped tags/zones in the uploaded DOCX.');
  if (!canonical(output).includes(canonical(values.bureauName))) throw new Error(`Late Payment output recipient integrity check failed: expected ${values.bureauName}.`);
  if (!canonical(output).includes(canonical(values.consumerName))) throw new Error(`Late Payment output consumer integrity check failed: expected ${values.consumerName}.`);
  if (!canonical(output).includes(canonical(values.letterDate))) throw new Error(`Late Payment output document-date integrity check failed: expected ${values.letterDate}.`);
  return blob;
}

export async function renderLatePaymentReference(reference: File, values: LateReferenceValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Late Payment DOCX is missing its document XML.');
  const xml = documentFile.asText();
  requireTemplateInjectionTags(xml, 'Late Payment letter');
  return validateGenerated(await renderDocxTemplate(reference, placeholderValues(values)), values);
}
