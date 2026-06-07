import { renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

const MAX_FTC_ACCOUNTS = 5;
const DEFAULT_REPORT_NUMBER = 'PENDING';

const DEFAULT_FTC_STATEMENT =
  'I am a victim of identity theft and request that all fraudulent accounts, inquiries, and information resulting from identity theft be blocked and removed from my credit file.';

function clean(value: unknown) {
  return String(value ?? '').trim();
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

function splitName(name: string) {
  const parts = clean(name).split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : ''
  };
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

function sourceAddress(source: ParsedSource) {
  const sourceAny = source as any;
  return Array.isArray(sourceAny.address) ? sourceAny.address.filter(Boolean).map(clean) : [];
}

function sourceReportDate(source: ParsedSource, documentDate: string) {
  const sourceAny = source as any;
  return clean(sourceAny.ftcReportDate) || documentDate;
}

function sourceReportNumber(source: ParsedSource) {
  const sourceAny = source as any;
  return clean(sourceAny.ftcReportNumber) || DEFAULT_REPORT_NUMBER;
}

function fallbackFraudDate(source: ParsedSource, documentDate: string) {
  return normalizeMonthYear(sourceReportDate(source, documentDate)) || documentDate;
}

function deriveDisputeAccount(displayText: string, fallbackDate: string): FtcAffectedAccount | null {
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
    fraudBegan: fallbackDate,
    dateDiscovered: compact?.[2] ? normalizeMonthYear(compact[2]) : fallbackDate,
    fraudulentAmount: normalizeAmount(compact?.[1] || '')
  };
}

function deriveInquiryAccount(displayText: string, fallbackDate: string): FtcAffectedAccount | null {
  const normalized = clean(displayText).replace(/\s*[–—]\s*/g, ' - ');
  const match = normalized.match(/^(.+?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/);

  if (!match) return null;

  return {
    accountName: clean(match[1]),
    accountNumber: '',
    fraudBegan: fallbackDate,
    dateDiscovered: normalizeMonthYear(match[2]),
    fraudulentAmount: ''
  };
}

export function buildFtcAffectedAccounts(source: ParsedSource): FtcAffectedAccount[] {
  const sourceAny = source as any;
  const fallbackDate = fallbackFraudDate(source, sourceAny.documentDate || new Date().toLocaleDateString('en-US'));

  const explicit = Array.isArray(sourceAny.ftcAccounts)
    ? sourceAny.ftcAccounts.map((item: any) => ({
        accountName: clean(item.accountName),
        accountNumber: clean(item.accountNumber),
        fraudBegan: clean(item.fraudBegan) || fallbackDate,
        dateDiscovered: clean(item.dateDiscovered) || fallbackDate,
        fraudulentAmount: normalizeAmount(item.fraudulentAmount)
      }))
    : [];

  const disputeItems = Object.values(sourceAny.dispute || {})
    .flat()
    .map((item: any) => {
      const base = deriveDisputeAccount(item?.displayText || '', fallbackDate);
      if (!base) return null;

      return {
        ...base,
        dateDiscovered: normalizeMonthYear(item?.ftcDerived?.dateDiscovered) || base.dateDiscovered,
        fraudulentAmount: normalizeAmount(item?.ftcDerived?.fraudulentAmount || base.fraudulentAmount)
      };
    })
    .filter(Boolean) as FtcAffectedAccount[];

  const inquiryItems = Object.values(sourceAny.inquiry || {})
    .flat()
    .map((item: any) => deriveInquiryAccount(item?.displayText || '', fallbackDate))
    .filter(Boolean) as FtcAffectedAccount[];

  const seen = new Set<string>();

  return [...explicit, ...disputeItems, ...inquiryItems]
    .filter((item) => {
      const key = `${item.accountName.toUpperCase()}|${item.accountNumber.toUpperCase()}|${item.dateDiscovered}`;
      if (!item.accountName || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.fraudulentAmount || 0) - Number(a.fraudulentAmount || 0))
    .slice(0, MAX_FTC_ACCOUNTS);
}

function ftcTemplateValues(source: ParsedSource, documentDate: string): PlaceholderValues {
  const sourceAny = source as any;
  const fullName = clean(sourceAny.name);
  const nameParts = splitName(fullName);
  const addressLines = sourceAddress(source);
  const reportDate = sourceReportDate(source, documentDate);
  const reportNumber = sourceReportNumber(source);
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
    country: 'USA',

    phone: normalizePhone(sourceAny.phone),
    email: clean(sourceAny.email),
    ssn: clean(sourceAny.ssn),
    dob: clean(sourceAny.dob),

    date: documentDate,
    document_date: documentDate,
    ftc_report_date: reportDate,
    report_date: reportDate,
    ftc_report_number: reportNumber,
    report_number: reportNumber,

    ftc_statement: clean(sourceAny.ftcStatement) || DEFAULT_FTC_STATEMENT,
    statement: clean(sourceAny.ftcStatement) || DEFAULT_FTC_STATEMENT,

    ftc_accounts: accountRows,
    accounts: accountRows,
    affected_accounts: accountRows,
    account_lines: accountRows.map((account) => account.account_line).join('\n')
  };

  for (let i = 0; i < MAX_FTC_ACCOUNTS; i += 1) {
    const account = accounts[i];
    const n = i + 1;

    values[`account_${n}_name`] = account?.accountName || '';
    values[`account_${n}_number`] = account?.accountNumber || '';
    values[`account_${n}_fraud_began`] = account?.fraudBegan || '';
    values[`account_${n}_date_discovered`] = account?.dateDiscovered || '';
    values[`account_${n}_fraudulent_amount`] = account?.fraudulentAmount || '';
    values[`account_${n}_fraud_amount`] = account?.fraudulentAmount || '';
  }

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

  return renderDocxTemplate(templateFile, ftcTemplateValues(source, documentDate));
}
