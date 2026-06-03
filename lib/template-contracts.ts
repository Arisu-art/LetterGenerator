import PizZip from 'pizzip';

export type TemplateDocumentKind = 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC' | 'DISPUTE_LETTER' | 'LATE_PAYMENT_LETTER';
export type TemplateFieldSection = 'CLIENT' | 'AFFIDAVIT' | 'FTC' | 'CUSTOM';
export type TemplateFieldContract = { key: string; label: string; section: TemplateFieldSection; sourceKey?: string; required: boolean };
export type TemplateContract = { version: 1; kind: TemplateDocumentKind; mode: 'PLACEHOLDERS' | 'LEGACY_HIGHLIGHTED' | 'STATIC' | 'REFERENCE_LAYOUT'; tags: string[]; loops: string[]; fields: TemplateFieldContract[]; customFields: TemplateFieldContract[] };
const BASE_FIELDS: Record<string, Omit<TemplateFieldContract, 'key'>> = {
  consumer_name: { label: 'Consumer name', section: 'CLIENT', sourceKey: 'name', required: true },
  client_name: { label: 'Consumer name', section: 'CLIENT', sourceKey: 'name', required: true },
  name: { label: 'Consumer name', section: 'CLIENT', sourceKey: 'name', required: true },
  consumer_first_name: { label: 'First name', section: 'FTC', sourceKey: 'firstName', required: true },
  consumer_middle_name: { label: 'Middle name', section: 'FTC', sourceKey: 'middleName', required: false },
  consumer_last_name: { label: 'Last name', section: 'FTC', sourceKey: 'lastName', required: true },
  address: { label: 'Address', section: 'CLIENT', sourceKey: 'address', required: true },
  address_inline: { label: 'Address', section: 'CLIENT', sourceKey: 'address', required: true },
  address_line_1: { label: 'Address line 1', section: 'CLIENT', sourceKey: 'address', required: true },
  address_line_2: { label: 'Address line 2', section: 'CLIENT', sourceKey: 'address', required: false },
  dob: { label: 'Date of birth', section: 'CLIENT', sourceKey: 'dob', required: false },
  ssn: { label: 'Masked SSN', section: 'CLIENT', sourceKey: 'ssn', required: true },
  ssn_masked: { label: 'Masked SSN', section: 'CLIENT', sourceKey: 'ssn', required: true },
  phone: { label: 'Phone', section: 'FTC', sourceKey: 'phone', required: false },
  email: { label: 'Email', section: 'FTC', sourceKey: 'email', required: false },
  country: { label: 'Country', section: 'FTC', sourceKey: 'country', required: false },
  date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },
  letter_date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },
  document_date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },
  affidavit_state: { label: 'State of execution', section: 'AFFIDAVIT', sourceKey: 'affidavitState', required: true },
  affidavit_county: { label: 'County of execution', section: 'AFFIDAVIT', sourceKey: 'affidavitCounty', required: true },
  ftc_report_number: { label: 'FTC report number', section: 'FTC', sourceKey: 'ftcReportNumber', required: true },
  ftc_report_date: { label: 'FTC report date', section: 'FTC', sourceKey: 'ftcReportDate', required: true },
  account_lines: { label: 'Disputed accounts', section: 'AFFIDAVIT', sourceKey: 'dispute', required: true },
  hard_inquiry_lines: { label: 'Hard inquiries', section: 'CLIENT', sourceKey: 'inquiry', required: false },
  ftc_accounts: { label: 'Affected accounts', section: 'FTC', sourceKey: 'ftcAccounts', required: true }
};
const LOOP_FIELDS = new Set(['accounts', 'dispute_accounts', 'hard_inquiries', 'ftc_accounts']);
const LOOP_CHILDREN = new Set(['account_name', 'account_number', 'account_line', 'display_text', 'inquiry_line', 'fraud_began', 'date_discovered', 'fraudulent_amount', 'fraud_amount']);
const FTC_LEGACY_KEYS = ['ftc_report_number', 'ftc_report_date', 'consumer_first_name', 'consumer_middle_name', 'consumer_last_name', 'address', 'country', 'phone', 'email', 'ftc_accounts'];
const AFFIDAVIT_LEGACY_KEYS = ['affidavit_state', 'affidavit_county', 'consumer_name', 'address_inline', 'ssn_masked', 'account_lines', 'document_date'];
const REFERENCE_KEYS = ['consumer_name', 'address', 'dob', 'ssn_masked', 'document_date', 'bureau_name', 'bureau_address'];
function humanLabel(key: string) { return key.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase()); }
function fieldFor(key: string): TemplateFieldContract { const known = BASE_FIELDS[key]; return known ? { key, ...known } : { key, label: humanLabel(key), section: 'CUSTOM', required: true }; }
function unique(values: string[]) { return Array.from(new Set(values)); }
function implicitFields(kind: TemplateDocumentKind) { if (kind === 'AFFIDAVIT') return AFFIDAVIT_LEGACY_KEYS.map(fieldFor); if (kind === 'FTC') return FTC_LEGACY_KEYS.map(fieldFor); if (kind === 'DISPUTE_LETTER' || kind === 'LATE_PAYMENT_LETTER') return REFERENCE_KEYS.map(fieldFor); return []; }
function placeholderFields(tags: string[], loops: string[], kind: TemplateDocumentKind) {
  const fields = tags.filter((key) => !LOOP_CHILDREN.has(key)).map(fieldFor);
  loops.forEach((key) => { if (key === 'ftc_accounts' || (kind === 'FTC' && (key === 'accounts' || key === 'dispute_accounts'))) fields.push(fieldFor('ftc_accounts')); else if (key === 'accounts' || key === 'dispute_accounts') fields.push(fieldFor('account_lines')); });
  const seen = new Set<string>();
  return fields.filter((field) => { if (seen.has(field.key)) return false; seen.add(field.key); return true; });
}
export async function inspectTemplateContract(file: File, kind: TemplateDocumentKind): Promise<TemplateContract> {
  if (kind === 'FCRA' || kind === 'ATTACHMENT') return { version: 1, kind, mode: 'STATIC', tags: [], loops: [], fields: [], customFields: [] };
  const zip = new PizZip(await file.arrayBuffer()); const xml = zip.file('word/document.xml')?.asText() || '';
  const tokens = Array.from(xml.matchAll(/\{\{\s*([#/^]?)([\w.-]+)\s*\}\}/g)).map((match) => ({ marker: match[1], key: match[2] }));
  const loops = unique(tokens.filter((token) => token.marker === '#' || token.marker === '^').map((token) => token.key));
  const tags = unique(tokens.filter((token) => !token.marker && !LOOP_FIELDS.has(token.key)).map((token) => token.key));
  const mode = tags.length || loops.length ? 'PLACEHOLDERS' : kind === 'DISPUTE_LETTER' || kind === 'LATE_PAYMENT_LETTER' ? 'REFERENCE_LAYOUT' : 'LEGACY_HIGHLIGHTED';
  const fields = mode === 'PLACEHOLDERS' ? placeholderFields(tags, loops, kind) : implicitFields(kind);
  return { version: 1, kind, mode, tags, loops, fields, customFields: fields.filter((field) => field.section === 'CUSTOM') };
}
export function unresolvedCustomTemplateFields(contracts: Array<TemplateContract | undefined | null>) { const seen = new Set<string>(); return contracts.flatMap((contract) => contract?.customFields || []).filter((field) => { if (seen.has(field.key)) return false; seen.add(field.key); return true; }); }
