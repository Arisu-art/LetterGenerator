import PizZip from 'pizzip';

export type TemplateDocumentKind = 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC' | 'DISPUTE_LETTER' | 'LATE_PAYMENT_LETTER';
export type TemplateFieldSection = 'CLIENT' | 'AFFIDAVIT' | 'FTC' | 'ROUTING' | 'CUSTOM';
export type TemplateFieldContract = { key: string; label: string; section: TemplateFieldSection; sourceKey?: string; required: boolean };
export type TemplateContract = {
  version: 1;
  kind: TemplateDocumentKind;
  mode: 'PLACEHOLDERS' | 'LEGACY_HIGHLIGHTED' | 'STATIC' | 'REFERENCE_LAYOUT';
  tags: string[];
  loops: string[];
  fields: TemplateFieldContract[];
  customFields: TemplateFieldContract[];
};

const BASE_FIELDS: Record<string, Omit<TemplateFieldContract, 'key'>> = {
  consumer_name: { label: 'Consumer name', section: 'CLIENT', sourceKey: 'name', required: true },
  client_name: { label: 'Consumer name', section: 'CLIENT', sourceKey: 'name', required: true },
  name: { label: 'Consumer name', section: 'CLIENT', sourceKey: 'name', required: true },
  full_name: { label: 'Full name', section: 'CLIENT', sourceKey: 'name', required: true },

  consumer_first_name: { label: 'First name', section: 'FTC', sourceKey: 'firstName', required: false },
  consumer_middle_name: { label: 'Middle name', section: 'FTC', sourceKey: 'middleName', required: false },
  consumer_last_name: { label: 'Last name', section: 'FTC', sourceKey: 'lastName', required: false },
  first_name: { label: 'First name', section: 'FTC', sourceKey: 'firstName', required: false },
  middle_name: { label: 'Middle name', section: 'FTC', sourceKey: 'middleName', required: false },
  last_name: { label: 'Last name', section: 'FTC', sourceKey: 'lastName', required: false },

  address: { label: 'Address', section: 'CLIENT', sourceKey: 'address', required: true },
  consumer_address: { label: 'Address', section: 'CLIENT', sourceKey: 'address', required: true },
  client_address: { label: 'Address', section: 'CLIENT', sourceKey: 'address', required: true },
  mailing_address: { label: 'Address', section: 'CLIENT', sourceKey: 'address', required: false },

  bureau: { label: 'Bureau name', section: 'ROUTING', sourceKey: 'bureauInfo.name', required: true },
  credit_bureau: { label: 'Bureau name', section: 'ROUTING', sourceKey: 'bureauInfo.name', required: true },
  bureau_full_name: { label: 'Bureau name', section: 'ROUTING', sourceKey: 'bureauInfo.name', required: true },

  current_date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },
  today: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },
  generated_date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },

  address_inline: { label: 'Address', section: 'CLIENT', sourceKey: 'address', required: true },
  address_line_1: { label: 'Address line 1', section: 'CLIENT', sourceKey: 'address', required: true },
  address_line_2: { label: 'Address line 2', section: 'CLIENT', sourceKey: 'address', required: false },
  city_state_zip: { label: 'City/state/zip', section: 'CLIENT', sourceKey: 'address', required: false },

  dob: { label: 'Date of birth', section: 'CLIENT', sourceKey: 'dob', required: false },
  ssn: { label: 'Masked SSN', section: 'CLIENT', sourceKey: 'ssn', required: false },
  ssn_masked: { label: 'Masked SSN', section: 'CLIENT', sourceKey: 'ssn', required: false },
  phone: { label: 'Phone', section: 'FTC', sourceKey: 'phone', required: false },
  email: { label: 'Email', section: 'FTC', sourceKey: 'email', required: false },
  country: { label: 'Country', section: 'FTC', sourceKey: 'country', required: false },

  date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },
  letter_date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },
  document_date: { label: 'Document date', section: 'CLIENT', sourceKey: 'generated', required: true },

  bureau_name: { label: 'Bureau name', section: 'ROUTING', sourceKey: 'bureauInfo.name', required: true },
  bureau_address: { label: 'Bureau address', section: 'ROUTING', sourceKey: 'bureauInfo.address', required: true },
  bureau_address_line_1: { label: 'Bureau address line 1', section: 'ROUTING', sourceKey: 'bureauInfo.address', required: true },
  bureau_address_line_2: { label: 'Bureau address line 2', section: 'ROUTING', sourceKey: 'bureauInfo.address', required: false },

  affidavit_state: { label: 'State of execution', section: 'AFFIDAVIT', sourceKey: 'affidavitState', required: true },
  affidavit_county: { label: 'County of execution', section: 'AFFIDAVIT', sourceKey: 'affidavitCounty', required: true },

  ftc_report_number: { label: 'FTC report number', section: 'FTC', sourceKey: 'ftcReportNumber', required: false },
  report_number: { label: 'FTC report number', section: 'FTC', sourceKey: 'ftcReportNumber', required: false },
  ftc_report_date: { label: 'FTC report date', section: 'FTC', sourceKey: 'ftcReportDate', required: false },
  report_date: { label: 'FTC report date', section: 'FTC', sourceKey: 'ftcReportDate', required: false },
  ftc_statement: { label: 'FTC statement', section: 'FTC', sourceKey: 'ftcStatement', required: false },
  statement: { label: 'FTC statement', section: 'FTC', sourceKey: 'ftcStatement', required: false },

  account_lines: { label: 'Disputed accounts', section: 'AFFIDAVIT', sourceKey: 'dispute', required: false },
  hard_inquiry_lines: { label: 'Hard inquiries', section: 'CLIENT', sourceKey: 'inquiry', required: false },
  ftc_accounts: { label: 'Affected accounts', section: 'FTC', sourceKey: 'ftcAccounts', required: false },
  accounts: { label: 'Accounts', section: 'FTC', sourceKey: 'ftcAccounts', required: false },
  affected_accounts: { label: 'Affected accounts', section: 'FTC', sourceKey: 'ftcAccounts', required: false }
};

const LOOP_FIELDS = new Set(['accounts', 'affected_accounts', 'dispute_accounts', 'hard_inquiries', 'ftc_accounts']);
const LOOP_CHILDREN = new Set([
  'index',
  'number',
  'account_name',
  'account_number',
  'account_line',
  'display_text',
  'inquiry_line',
  'fraud_began',
  'date_discovered',
  'fraudulent_amount',
  'fraud_amount'
]);
const SYSTEM_ROUTING_FIELDS = new Set(['bureau_name', 'bureau_address', 'bureau_address_line_1', 'bureau_address_line_2']);
const FTC_LEGACY_KEYS = [
  'ftc_report_number',
  'ftc_report_date',
  'consumer_first_name',
  'consumer_middle_name',
  'consumer_last_name',
  'address',
  'country',
  'phone',
  'email',
  'ftc_accounts'
];
const AFFIDAVIT_LEGACY_KEYS = ['affidavit_state', 'affidavit_county', 'consumer_name', 'address_inline', 'ssn_masked', 'account_lines', 'document_date'];
const REFERENCE_KEYS = ['consumer_name', 'address', 'dob', 'ssn_masked', 'document_date', 'bureau_name', 'bureau_address'];
const XML_PART = /^word\/(?:document|header\d+|footer\d+)\.xml$/i;

function humanLabel(key: string) {
  return key.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

function fieldFor(key: string, kind?: TemplateDocumentKind): TemplateFieldContract {
  const known = BASE_FIELDS[key];
  const field: TemplateFieldContract = known
    ? { key, ...known }
    : { key, label: humanLabel(key), section: 'CUSTOM', required: kind !== 'FTC' };

  return kind === 'FTC' ? { ...field, required: false } : field;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function visibleText(xml: string) {
  return xml
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function templateText(zip: PizZip) {
  return Object.keys(zip.files)
    .filter((name) => XML_PART.test(name))
    .map((name) => visibleText(zip.file(name)?.asText() || ''))
    .join('\n');
}

function implicitFields(kind: TemplateDocumentKind) {
  if (kind === 'AFFIDAVIT') return AFFIDAVIT_LEGACY_KEYS.map((key) => fieldFor(key, kind));
  if (kind === 'FTC') return FTC_LEGACY_KEYS.map((key) => fieldFor(key, kind));
  if (kind === 'DISPUTE_LETTER' || kind === 'LATE_PAYMENT_LETTER') return REFERENCE_KEYS.map((key) => fieldFor(key, kind));
  return [];
}

function placeholderFields(tags: string[], loops: string[], kind: TemplateDocumentKind) {
  const fields = tags
    .filter((key) => !LOOP_CHILDREN.has(key))
    .map((key) => fieldFor(key, kind));

  loops.forEach((key) => {
    if (key === 'ftc_accounts' || key === 'affected_accounts' || (kind === 'FTC' && (key === 'accounts' || key === 'dispute_accounts'))) {
      fields.push(fieldFor('ftc_accounts', kind));
    } else if (key === 'accounts' || key === 'dispute_accounts') {
      fields.push(fieldFor('account_lines', kind));
    }
  });

  const seen = new Set<string>();

  return fields.filter((field) => {
    if (seen.has(field.key)) return false;
    seen.add(field.key);
    return true;
  });
}

export async function inspectTemplateContract(file: File, kind: TemplateDocumentKind): Promise<TemplateContract> {
  if (kind === 'FCRA' || kind === 'ATTACHMENT') {
    return { version: 1, kind, mode: 'STATIC', tags: [], loops: [], fields: [], customFields: [] };
  }

  const zip = new PizZip(await file.arrayBuffer());
  const xml = templateText(zip);
  const tokens = Array.from(xml.matchAll(/\{\{\s*([#\/^]?)([\w.-]+)\s*\}\}/g)).map((match) => ({
    marker: match[1],
    key: match[2]
  }));

  const loops = unique(tokens.filter((token) => token.marker === '#' || token.marker === '^').map((token) => token.key));
  const tags = unique(tokens.filter((token) => !token.marker && !LOOP_FIELDS.has(token.key)).map((token) => token.key));
  const mode = tags.length || loops.length ? 'PLACEHOLDERS' : kind === 'DISPUTE_LETTER' || kind === 'LATE_PAYMENT_LETTER' ? 'REFERENCE_LAYOUT' : 'LEGACY_HIGHLIGHTED';
  const fields = mode === 'PLACEHOLDERS' ? placeholderFields(tags, loops, kind) : implicitFields(kind);

  return {
    version: 1,
    kind,
    mode,
    tags,
    loops,
    fields,
    customFields: fields.filter((field) => field.section === 'CUSTOM' && !SYSTEM_ROUTING_FIELDS.has(field.key))
  };
}

export function unresolvedCustomTemplateFields(contracts: Array<TemplateContract | undefined | null>) {
  const seen = new Set<string>();

  return contracts
    .flatMap((contract) => contract?.customFields || [])
    .filter((field) => {
      if (SYSTEM_ROUTING_FIELDS.has(field.key) || seen.has(field.key)) return false;
      seen.add(field.key);
      return true;
    });
}
