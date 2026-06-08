import JSZip from 'jszip';
import { renderDocxTemplate, type PlaceholderValues, type TemplateValue } from './docx-renderer';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

const FTC_FIXED_FIELD_COUNT = 25;

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeKey(value: string) {
  return clean(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s.-]+/g, '_')
    .replace(/[^\w]/g, '')
    .toLowerCase();
}

function normalizePhone(value: unknown) {
  const raw = clean(value);
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return raw;
}

function normalizeAmount(value: unknown) {
  return clean(value).replace(/^\$/, '').replace(/,/g, '');
}

function normalizeMonthYear(value: unknown) {
  const raw = clean(value);
  if (!raw) return '';

  const match = raw.match(/(\d{1,2})\/(?:\d{1,2}\/)?(\d{2,4})/);
  if (!match) return raw;

  const month = String(Number(match[1]));
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];

  return `${month}/${year}`;
}

function splitName(name: string) {
  const parts = clean(name).split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

function sourceAddress(source: ParsedSource) {
  const sourceAny = source as any;
  return Array.isArray(sourceAny.address)
    ? sourceAny.address.map(clean).filter(Boolean)
    : [];
}

function safeStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value);
  if (Array.isArray(value)) return value.map(safeStringValue).filter(Boolean).join('\n');
  return '';
}

function flattenSourceValues(source: ParsedSource) {
  const sourceAny = source as any;
  const values: Record<string, string> = {};

  function visit(prefix: string, value: unknown) {
    if (value === null || value === undefined) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      values[normalizeKey(prefix)] = safeStringValue(value);
      return;
    }

    if (Array.isArray(value)) {
      values[normalizeKey(prefix)] = value.map(safeStringValue).filter(Boolean).join('\n');
      return;
    }

    if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        visit(prefix ? `${prefix}_${key}` : key, child);
      });
    }
  }

  Object.entries(sourceAny).forEach(([key, value]) => visit(key, value));
  return values;
}

function extractTemplateTags(templateFile: File): Promise<string[]> {
  return templateFile.arrayBuffer().then(async (buffer) => {
    const zip = await JSZip.loadAsync(buffer);
    const xmlFiles = Object.keys(zip.files).filter((name) => /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(name));
    const tags = new Set<string>();

    for (const fileName of xmlFiles) {
      const file = zip.file(fileName);
      if (!file) continue;

      const xml = await file.async('string');
      Array.from(xml.matchAll(/\{\{\s*[#\/^]?([\w.-]+)\s*\}\}/g)).forEach((match) => {
        tags.add(match[1]);
      });
    }

    return Array.from(tags);
  });
}

function deriveDisputeAccount(displayText: string): FtcAffectedAccount | null {
  const lines = clean(displayText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const accountName = clean(
    (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '')
  );

  const accountNumber = clean(
    (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '')
  );

  const compact = lines.join(' ').match(/(?:^|\s)(\d{1,8}(?:\.\d{1,2})?)?\s*((?:0?[1-9]|1[0-2])\/(?:19|20)?\d{2})(?:\s|$)/);

  if (!accountName) return null;

  return {
    accountName,
    accountNumber,
    fraudBegan: '',
    dateDiscovered: compact?.[2] ? normalizeMonthYear(compact[2]) : '',
    fraudulentAmount: normalizeAmount(compact?.[1] || '')
  };
}

function deriveInquiryAccount(displayText: string): FtcAffectedAccount | null {
  const normalized = clean(displayText).replace(/\s*[–—]\s*/g, ' - ');
  const match = normalized.match(/^(.+?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/);

  if (!match) return null;

  return {
    accountName: clean(match[1]),
    accountNumber: '',
    fraudBegan: '',
    dateDiscovered: normalizeMonthYear(match[2]),
    fraudulentAmount: ''
  };
}

export function buildFtcAffectedAccounts(source: ParsedSource): FtcAffectedAccount[] {
  const sourceAny = source as any;

  const explicit = Array.isArray(sourceAny.ftcAccounts)
    ? sourceAny.ftcAccounts.map((item: any) => ({
        accountName: clean(item.accountName),
        accountNumber: clean(item.accountNumber),
        fraudBegan: clean(item.fraudBegan),
        dateDiscovered: clean(item.dateDiscovered),
        fraudulentAmount: normalizeAmount(item.fraudulentAmount)
      }))
    : [];

  const disputeItems = Object.values(sourceAny.dispute || {})
    .flat()
    .map((item: any) => {
      const base = deriveDisputeAccount(item?.displayText || '');
      if (!base) return null;

      return {
        ...base,
        fraudBegan: normalizeMonthYear(item?.ftcDerived?.fraudBegan) || base.fraudBegan,
        dateDiscovered: normalizeMonthYear(item?.ftcDerived?.dateDiscovered) || base.dateDiscovered,
        fraudulentAmount: normalizeAmount(item?.ftcDerived?.fraudulentAmount || base.fraudulentAmount)
      };
    })
    .filter(Boolean) as FtcAffectedAccount[];

  const inquiryItems = Object.values(sourceAny.inquiry || {})
    .flat()
    .map((item: any) => deriveInquiryAccount(item?.displayText || ''))
    .filter(Boolean) as FtcAffectedAccount[];

  const seen = new Set<string>();

  return [...explicit, ...disputeItems, ...inquiryItems]
    .filter((item) => {
      const key = `${item.accountName.toUpperCase()}|${item.accountNumber.toUpperCase()}|${item.dateDiscovered}`;
      if (!item.accountName || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.fraudulentAmount || 0) - Number(a.fraudulentAmount || 0));
}

async function ftcTemplateValues(source: ParsedSource, documentDate: string, templateFile: File): Promise<PlaceholderValues> {
  const sourceAny = source as any;
  const sourceFlat = flattenSourceValues(source);
  const fullName = clean(sourceAny.name);
  const nameParts = splitName(fullName);
  const addressLines = sourceAddress(source);
  const accounts = buildFtcAffectedAccounts(source);

  const accountRows = accounts.map((account, index) => ({
    index: String(index + 1),
    number: String(index + 1),
    account_name: account.accountName,
    account_number: account.accountNumber,
    fraud_began: account.fraudBegan,
    date_discovered: account.dateDiscovered,
    fraudulent_amount: account.fraudulentAmount,
    fraud_amount: account.fraudulentAmount,
    account_line: [account.accountName, account.accountNumber].filter(Boolean).join(' — ')
  }));

  const values: PlaceholderValues = {
    consumer_name: fullName,
    client_name: fullName,
    name: fullName,
    full_name: fullName,

    consumer_first_name: clean(sourceAny.firstName) || nameParts.firstName,
    consumer_middle_name: clean(sourceAny.middleName) || nameParts.middleName,
    consumer_last_name: clean(sourceAny.lastName) || nameParts.lastName,
    first_name: clean(sourceAny.firstName) || nameParts.firstName,
    middle_name: clean(sourceAny.middleName) || nameParts.middleName,
    last_name: clean(sourceAny.lastName) || nameParts.lastName,

    address: addressLines.join('\n'),
    address_inline: addressLines.join(' '),
    address_line_1: addressLines[0] || '',
    address_line_2: addressLines.slice(1).join(' '),
    city_state_zip: addressLines.slice(1).join(' '),

    phone: normalizePhone(sourceAny.phone),
    email: clean(sourceAny.email),
    ssn: clean(sourceAny.ssn),
    ssn_masked: clean(sourceAny.ssn),
    dob: clean(sourceAny.dob),

    date: documentDate,
    document_date: documentDate,
    letter_date: documentDate,

    ftc_report_number: clean(sourceAny.ftcReportNumber),
    report_number: clean(sourceAny.ftcReportNumber),
    ftc_report_date: clean(sourceAny.ftcReportDate),
    report_date: clean(sourceAny.ftcReportDate),
    ftc_statement: clean(sourceAny.ftcStatement),
    statement: clean(sourceAny.ftcStatement),

    ftc_accounts: accountRows,
    accounts: accountRows,
    affected_accounts: accountRows,
    account_lines: accountRows.map((account) => account.account_line).join('\n')
  };

  for (let i = 0; i < FTC_FIXED_FIELD_COUNT; i += 1) {
    const account = accounts[i];
    const n = i + 1;

    values[`account_${n}_name`] = account?.accountName || '';
    values[`account_${n}_number`] = account?.accountNumber || '';
    values[`account_${n}_fraud_began`] = account?.fraudBegan || '';
    values[`account_${n}_date_discovered`] = account?.dateDiscovered || '';
    values[`account_${n}_fraudulent_amount`] = account?.fraudulentAmount || '';
    values[`account_${n}_fraud_amount`] = account?.fraudulentAmount || '';
  }

  const templateTags = await extractTemplateTags(templateFile);

  templateTags.forEach((tag) => {
    if (values[tag] !== undefined) return;

    const normalized = normalizeKey(tag);
    const direct = sourceFlat[normalized];

    values[tag] = direct ?? '';
  });

  return values;
}

export async function renderFtcIdentityTheftReportDocx(
  source: ParsedSource,
  documentDate: string,
  templateFile?: File
) {
  if (!templateFile) {
    throw new Error('Required component missing: upload the FTC Identity Theft Report DOCX template before generation.');
  }

  return renderDocxTemplate(templateFile, await ftcTemplateValues(source, documentDate, templateFile));
}
