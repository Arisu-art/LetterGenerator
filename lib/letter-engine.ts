export type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
export type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
export type ItemType = 'DISPUTE_ACCOUNT' | 'HARD_INQUIRY' | 'LATE_PAYMENT';
export type FtcDerivedFields = { dateDiscovered: string; fraudulentAmount: string };
export type SourceItem = { type: ItemType; displayText: string; ftcDerived?: FtcDerivedFields };
export type FtcAffectedAccount = { accountName: string; accountNumber: string; fraudBegan: string; dateDiscovered: string; fraudulentAmount: string };
export type ParseDiagnostic = { level: 'warning' | 'info'; message: string; line?: number };
export type PreservedSourceLine = { line: number; text: string; reason: string };
export type ParsedSource = {
  name: string; firstName: string; middleName: string; lastName: string;
  address: string[]; country: string; dob: string; ssn: string; phone: string; email: string;
  affidavitState: string; affidavitCounty: string;
  ftcReportNumber: string; ftcReportDate: string; ftcAccounts: FtcAffectedAccount[];
  templateFields: Record<string, string>;
  dispute: Record<Bureau, SourceItem[]>; inquiry: Record<Bureau, SourceItem[]>; late: Record<Bureau, SourceItem[]>;
  preserved: PreservedSourceLine[]; diagnostics: ParseDiagnostic[];
};
export type LetterRoute = { bureau: Bureau; type: LetterType; items: SourceItem[]; reason: string };
export type NormalizedSourceCopy = { text: string; usedFields: string[]; reservedFields: string[]; preservedLines: PreservedSourceLine[] };

export const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
export const MAX_FTC_ACCOUNTS = 5;
export const bureauInfo: Record<Bureau, { name: string; address: string }> = {
  TRANSUNION: { name: 'TransUnion', address: 'PO Box 2000\nChester, PA 19016' },
  EQUIFAX: { name: 'Equifax Information Services LLC', address: 'PO Box 105139\nAtlanta, GA 30348' },
  EXPERIAN: { name: 'Experian', address: 'PO Box 4500\nAllen, TX 75013' }
};

type Section = 'header' | 'ftc' | 'dispute' | 'inquiry' | 'late' | 'ignore';
type ItemStore = Record<Bureau, SourceItem[]>;
const DATE_PATTERN = /\b(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:\d{2}|\d{4})\b/;
const MONTH_YEAR_PATTERN = /(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}/;
const ACCOUNT_NAME = /^(?:ACCOUNT|CREDITOR|FURNISHER|COMPANY)(?:\s*(?:OR\s+ORGANIZATION))?\s*(?:NAME)?\s*[:#-]\s*(.+)$/i;
const ACCOUNT_NUMBER = /^(?:ACCOUNT|ACCT)\s*(?:NUMBER|NO\.?|#)\s*[:#-]\s*(.*)$/i;
const FRAUD_BEGAN = /^(?:FRAUD\s+BEGAN|DATE\s+FRAUD\s+BEGAN)\s*[:#-]\s*(.*)$/i;
const DATE_DISCOVERED = /^(?:DATE\s+DISCOVERED|DISCOVERED)\s*[:#-]\s*(.*)$/i;
const FRAUD_AMOUNT = /^(?:FRAUDULENT\s+AMOUNT|TOTAL\s+FRAUDULENT\s+AMOUNT|AMOUNT)\s*[:#-]\s*\$?\s*(.*)$/i;
const COMPACT_FTC_DETAIL = /^\s*\$?([\d,]+(?:\.\d{1,2})?)\s+((?:0?[1-9]|1[0-2])\/(?:19|20)\d{2})\s*$/;
const TEMPLATE_FIELD = /^TEMPLATE\s+FIELD\s+([\w.-]+)\s*:\s*(.*)$/i;
const PHONE_FIELD = /^(?:PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE)\s*:\s*/i;
const KNOWN_HEADER = /^(NAME|CLIENT|CONSUMER(?:\s+NAME)?|FIRST\s+NAME|MIDDLE\s+NAME|LAST\s+NAME|ADDRESS|COUNTRY|DOB|SSN|PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE|EMAIL|E-?MAIL|AFFIDAVIT\s+STATE|AFFIDAVIT\s+COUNTY|FTC\s+REPORT\s+NUMBER|FTC\s+REPORT\s+DATE|TEMPLATE\s+FIELD\s+[\w.-]+)\s*:/i;
const RESERVED_HEADER = /^(PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE|EMAIL|E-?MAIL|COUNTRY)\s*:/i;
function itemMap(): ItemStore { return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }; }
function normalized(value: string) { return value.replace(/[\[\]{}()=*#_]+/g, ' ').replace(/[:\-|/]+$/g, '').replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase(); }
function safeLine(value: string) { return value.replace(/\s+/g, ' ').trim(); }
function maskedAccountNumber(value: string) { return value.replace(/x/gi, 'X'); }
function easternParts() { const parts = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' }).formatToParts(new Date()); return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])); }
export function automatedFtcReportDate() { const values = easternParts(); const shifted = new Date(Date.UTC(values.year, values.month - 1, values.day - 5)); return `${String(shifted.getUTCMonth() + 1).padStart(2, '0')}/${String(shifted.getUTCDate()).padStart(2, '0')}/${shifted.getUTCFullYear()}`; }
export function ftcFraudMonthYearFromReportDate(reportDate = automatedFtcReportDate()) { const match = reportDate.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/); return match ? `${Number(match[1])}/${match[2]}` : (() => { const values = easternParts(); return `${values.month}/${values.year}`; })(); }
/** Kept for existing imports: fraud-began month now follows the calculated FTC report date. */
export function currentFtcFraudMonthYear() { return ftcFraudMonthYearFromReportDate(); }
export function validFtcAccounts(items: FtcAffectedAccount[]) { return items.length > 0 && items.length <= MAX_FTC_ACCOUNTS && items.every((item) => Boolean(item.accountName.trim() && item.dateDiscovered.trim())); }
function bureauIn(value: string): Bureau | '' { const key = normalized(value); if (/\b(TRANS\s*UNION|TRANSUNION|TU)\b/.test(key)) return 'TRANSUNION'; if (/\b(EQUIFAX|EQ)\b/.test(key)) return 'EQUIFAX'; if (/\b(EXPERIAN|EXP)\b/.test(key)) return 'EXPERIAN'; return ''; }
function isBureauHeading(value: string) { return /^(TRANS\s*UNION|TRANSUNION|TU|EQUIFAX|EQ|EXPERIAN|EXP)$/.test(normalized(value).replace(/^(CREDIT\s+)?BUREAU\s+/, '')); }
function sectionOf(value: string): Section | '' { const key = normalized(value); if (/^(PRESERVED\s+SOURCE\s+DATA|SUPPLEMENTAL\s+CLIENT\s+DATA|UNMAPPED\s+SOURCE\s+TEXT)/.test(key)) return 'ignore'; if (/^(FTC\s+IDENTITY\s+THEFT\s+REPORT|FTC\s+AFFECTED\s+ACCOUNTS?|AFFECTED\s+ACCOUNTS?)$/.test(key)) return 'ftc'; if (/\b(HARD\s*(INQ|INQUIRY|INQUIRIES)|INQUIRY\s+REMOVAL)\b/.test(key)) return 'inquiry'; if (/\b(LATE\s*(PAY|PAYMENT|PAYMENTS)|PAYMENT\s+HISTORY\s+DISPUTE)\b/.test(key)) return 'late'; if (/\b(FOR\s+DISPUTE|DISPUTE\s+(ACCOUNTS?|ITEMS?|RECORDS?|LETTERS?)|FRAUDULENT\s+ACCOUNTS?|IDENTITY\s+THEFT\s+ACCOUNTS?)\b/.test(key) || /^(DISPUTE|DISPUTES)$/.test(key)) return 'dispute'; if (/^(OPEN\s+ACCOUNTS?|PERSONAL\s+INFORMATION|EMPLOYMENT|SUMMARY|NOTES?)$/.test(key)) return 'ignore'; return ''; }
function isSectionHeading(value: string, section: Section) { const key = normalized(value); if (section === 'ignore') return true; if (section === 'ftc') return /^(FTC\s+IDENTITY\s+THEFT\s+REPORT|FTC\s+AFFECTED\s+ACCOUNTS?|AFFECTED\s+ACCOUNTS?)$/.test(key); if (section === 'inquiry') return key.length < 64 && /HARD\s*(INQ|INQUIRY|INQUIRIES)|INQUIRY\s+REMOVAL/.test(key); if (section === 'late') return key.length < 68 && /LATE\s*(PAY|PAYMENT|PAYMENTS)|PAYMENT\s+HISTORY\s+DISPUTE/.test(key); return key.length < 76 && /DISPUTE|FRAUDULENT\s+ACCOUNTS?|IDENTITY\s+THEFT\s+ACCOUNTS?/.test(key); }
function isNoData(value: string) { return /^(N+ONE|NONE|NO\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LATE\s+PAYMENTS?|HARD\s+INQUIR(?:Y|IES))|N\/?A|NOTHING|NOT\s+APPLICABLE)$/i.test(normalized(value)); }
function cleanLines(lines: string[]) { return lines.map(safeLine).filter(Boolean).filter((line) => !isNoData(line)); }
function fieldValue(lines: string[], pattern: RegExp) { for (const line of lines) { const match = line.match(pattern); if (match && match[1] !== undefined) return safeLine(match[1]); } return ''; }
function ftcDerivedFields(lines: string[]): FtcDerivedFields { const clean = cleanLines(lines); const compact = clean.map((line) => line.match(COMPACT_FTC_DETAIL)).find(Boolean); return { fraudulentAmount: fieldValue(clean, FRAUD_AMOUNT) || compact?.[1]?.replaceAll(',', '') || '', dateDiscovered: fieldValue(clean, DATE_DISCOVERED) || compact?.[2] || '' }; }
function disputeDisplayText(lines: string[]) { const clean = cleanLines(lines); const name = fieldValue(clean, ACCOUNT_NAME); const number = maskedAccountNumber(fieldValue(clean, ACCOUNT_NUMBER)); return name || number ? [name ? `Account Name: ${name}` : '', number ? `Account Number: ${number}` : ''].filter(Boolean).join('\n') : ''; }
function lateDisplayText(lines: string[]) { const clean = cleanLines(lines); const name = fieldValue(clean, ACCOUNT_NAME); const number = maskedAccountNumber(fieldValue(clean, ACCOUNT_NUMBER)); const relevant = clean.filter((line) => /late|payment|30\s*day|60\s*day|90\s*day|120\s*day/i.test(line)); return name || number ? [name ? `Account Name: ${name}` : '', number ? `Account Number: ${number}` : '', ...relevant.filter((line) => !ACCOUNT_NAME.test(line) && !ACCOUNT_NUMBER.test(line))].filter(Boolean).join('\n') : ''; }
function inquiryDisplayText(lines: string[]) { const joined = cleanLines(lines).join(' - '); return DATE_PATTERN.test(joined) ? joined.replace(/\s*[-–—]\s*/g, ' - ').replace(/\s+/g, ' ').trim() : ''; }
function createItem(type: ItemType, lines: string[]) { const displayText = type === 'DISPUTE_ACCOUNT' ? disputeDisplayText(lines) : type === 'HARD_INQUIRY' ? inquiryDisplayText(lines) : lateDisplayText(lines); if (!displayText) return null; return type === 'DISPUTE_ACCOUNT' ? { type, displayText, ftcDerived: ftcDerivedFields(lines) } : { type, displayText }; }
function createFtcAccount(lines: string[]): FtcAffectedAccount | null { const clean = cleanLines(lines); const accountName = fieldValue(clean, ACCOUNT_NAME); const accountNumber = maskedAccountNumber(fieldValue(clean, ACCOUNT_NUMBER)); if (!accountName) return null; const derived = ftcDerivedFields(clean); return { accountName, accountNumber, fraudBegan: ftcFraudMonthYearFromReportDate(), dateDiscovered: derived.dateDiscovered, fraudulentAmount: derived.fraudulentAmount }; }
function appendUnique(target: SourceItem[], item: SourceItem | null, diagnostics: ParseDiagnostic[], bureau: Bureau) { if (!item) return; const key = `${item.type}|${normalized(item.displayText)}`; if (target.some((current) => `${current.type}|${normalized(current.displayText)}` === key)) { diagnostics.push({ level: 'info', message: `Duplicate ${item.type.toLowerCase().replaceAll('_', ' ')} removed for ${bureau}.` }); return; } target.push(item); }
function appendUniqueFtc(target: FtcAffectedAccount[], item: FtcAffectedAccount | null, diagnostics: ParseDiagnostic[]) { if (!item) return; const key = `${normalized(item.accountName)}|${normalized(item.accountNumber)}|${normalized(item.dateDiscovered)}`; if (target.some((current) => `${normalized(current.accountName)}|${normalized(current.accountNumber)}|${normalized(current.dateDiscovered)}` === key)) { diagnostics.push({ level: 'info', message: 'Duplicate FTC affected item removed.' }); return; } if (target.length >= MAX_FTC_ACCOUNTS) { diagnostics.push({ level: 'warning', message: `FTC affected items are limited to ${MAX_FTC_ACCOUNTS}; additional records were not included.` }); return; } target.push(item); }
function headerField(lines: string[], label: RegExp) { const line = lines.find((entry) => label.test(entry)); return line ? line.replace(label, '').trim() : ''; }
function looksLikeRecord(line: string) { return ACCOUNT_NAME.test(line) || ACCOUNT_NUMBER.test(line) || FRAUD_BEGAN.test(line) || DATE_DISCOVERED.test(line) || FRAUD_AMOUNT.test(line) || DATE_PATTERN.test(line) || MONTH_YEAR_PATTERN.test(line); }
function pushPreserved(parsed: ParsedSource, line: number, text: string, reason: string) { if (!parsed.preserved.some((item) => item.line === line && item.text === text)) parsed.preserved.push({ line, text, reason }); }
function splitName(name: string) { const parts = safeLine(name).split(' ').filter(Boolean); return { firstName: parts[0] || '', middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '', lastName: parts.length > 1 ? parts[parts.length - 1] : '' }; }
function inferredFtcCandidates(parsed: ParsedSource) {
  const candidates: FtcAffectedAccount[] = []; const seen = new Set<string>();
  bureaus.forEach((bureau) => parsed.dispute[bureau].forEach((item) => {
    if (!item.ftcDerived?.dateDiscovered || !item.ftcDerived?.fraudulentAmount) return;
    const lines = item.displayText.split('\n'); const accountName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, ''); const accountNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, ''); const key = `${normalized(accountName)}|${normalized(accountNumber)}|${normalized(item.ftcDerived.dateDiscovered)}`;
    if (seen.has(key)) return; seen.add(key); candidates.push({ accountName, accountNumber, fraudBegan: ftcFraudMonthYearFromReportDate(parsed.ftcReportDate || automatedFtcReportDate()), dateDiscovered: item.ftcDerived.dateDiscovered, fraudulentAmount: item.ftcDerived.fraudulentAmount });
  }));
  return candidates;
}
function emptyParsed(): ParsedSource {
  return { name: '', firstName: '', middleName: '', lastName: '', address: [], country: '', dob: '', ssn: '', phone: '', email: '', affidavitState: '', affidavitCounty: '', ftcReportNumber: '', ftcReportDate: '', ftcAccounts: [], templateFields: {}, dispute: itemMap(), inquiry: itemMap(), late: itemMap(), preserved: [], diagnostics: [] };
}
function setHeader(parsed: ParsedSource, line: string) {
  const value = (pattern: RegExp) => headerField([line], pattern);
  const name = value(/^(?:NAME|CLIENT|CONSUMER(?:\s+NAME)?)\s*:/i);
  if (name) { parsed.name = name; Object.assign(parsed, splitName(name)); return true; }
  const first = value(/^FIRST\s+NAME\s*:/i); if (first) { parsed.firstName = first; return true; }
  const middle = value(/^MIDDLE\s+NAME\s*:/i); if (middle) { parsed.middleName = middle; return true; }
  const last = value(/^LAST\s+NAME\s*:/i); if (last) { parsed.lastName = last; return true; }
  const address = value(/^ADDRESS\s*:/i); if (address) { parsed.address.push(address); return true; }
  const country = value(/^COUNTRY\s*:/i); if (country) { parsed.country = country; return true; }
  const dob = value(/^DOB\s*:/i); if (dob) { parsed.dob = dob; return true; }
  const ssn = value(/^SSN\s*:/i); if (ssn) { parsed.ssn = ssn; return true; }
  const phone = value(PHONE_FIELD); if (phone) { parsed.phone = phone; return true; }
  const email = value(/^(?:EMAIL|E-?MAIL)\s*:/i); if (email) { parsed.email = email; return true; }
  const state = value(/^AFFIDAVIT\s+STATE\s*:/i); if (state) { parsed.affidavitState = state; return true; }
  const county = value(/^AFFIDAVIT\s+COUNTY\s*:/i); if (county) { parsed.affidavitCounty = county; return true; }
  const reportNumber = value(/^FTC\s+REPORT\s+NUMBER\s*:/i); if (reportNumber) { parsed.ftcReportNumber = reportNumber; return true; }
  const reportDate = value(/^FTC\s+REPORT\s+DATE\s*:/i); if (reportDate) { parsed.ftcReportDate = reportDate; return true; }
  const template = line.match(TEMPLATE_FIELD); if (template) { parsed.templateFields[template[1]] = safeLine(template[2]); return true; }
  return false;
}
function flushRecord(parsed: ParsedSource, section: Section, bureau: Bureau | '', buffer: string[]) {
  if (!buffer.length) return;
  if (section === 'ftc') appendUniqueFtc(parsed.ftcAccounts, createFtcAccount(buffer), parsed.diagnostics);
  if (bureau && section === 'dispute') appendUnique(parsed.dispute[bureau], createItem('DISPUTE_ACCOUNT', buffer), parsed.diagnostics, bureau);
  if (bureau && section === 'inquiry') appendUnique(parsed.inquiry[bureau], createItem('HARD_INQUIRY', buffer), parsed.diagnostics, bureau);
  if (bureau && section === 'late') appendUnique(parsed.late[bureau], createItem('LATE_PAYMENT', buffer), parsed.diagnostics, bureau);
}
export function parseSource(text: string): ParsedSource {
  const parsed = emptyParsed();
  const lines = text.split(/\r?\n/);
  let section: Section = 'header';
  let bureau: Bureau | '' = '';
  let buffer: string[] = [];
  lines.forEach((raw, index) => {
    const line = safeLine(raw);
    if (!line) { flushRecord(parsed, section, bureau, buffer); buffer = []; return; }
    const nextSection = sectionOf(line);
    const nextBureau = bureauIn(line);
    if (KNOWN_HEADER.test(line)) {
      flushRecord(parsed, section, bureau, buffer); buffer = [];
      if (!setHeader(parsed, line) && !RESERVED_HEADER.test(line)) pushPreserved(parsed, index + 1, line, 'unhandled header field');
      return;
    }
    if (nextSection && isSectionHeading(line, nextSection)) { flushRecord(parsed, section, bureau, buffer); buffer = []; section = nextSection; return; }
    if (nextBureau && isBureauHeading(line)) { flushRecord(parsed, section, bureau, buffer); buffer = []; bureau = nextBureau; return; }
    if (section === 'header') { if (!setHeader(parsed, line)) { if (parsed.address.length && !looksLikeRecord(line)) parsed.address.push(line); else pushPreserved(parsed, index + 1, line, 'unmapped header text'); } return; }
    if (section === 'ignore') { pushPreserved(parsed, index + 1, line, 'ignored source section'); return; }
    if (looksLikeRecord(line) && buffer.some((item) => ACCOUNT_NAME.test(item)) && ACCOUNT_NAME.test(line)) { flushRecord(parsed, section, bureau, buffer); buffer = []; }
    buffer.push(line);
  });
  flushRecord(parsed, section, bureau, buffer);
  if (!parsed.name && (parsed.firstName || parsed.lastName)) { parsed.name = [parsed.firstName, parsed.middleName, parsed.lastName].filter(Boolean).join(' '); }
  if (!parsed.ftcReportDate) parsed.ftcReportDate = automatedFtcReportDate();
  parsed.ftcAccounts = parsed.ftcAccounts.length ? parsed.ftcAccounts : inferredFtcCandidates(parsed);
  if (!parsed.name) parsed.diagnostics.push({ level: 'warning', message: 'Client name was not detected.' });
  if (!parsed.address.length) parsed.diagnostics.push({ level: 'warning', message: 'Client address was not detected.' });
  if (!parsed.dob) parsed.diagnostics.push({ level: 'warning', message: 'DOB was not detected.' });
  if (!parsed.ssn) parsed.diagnostics.push({ level: 'warning', message: 'SSN was not detected.' });
  return parsed;
}
export function detectRoutes(parsed: ParsedSource): LetterRoute[] {
  const routes: LetterRoute[] = [];
  bureaus.forEach((bureau) => {
    const disputeItems = [...parsed.dispute[bureau], ...parsed.inquiry[bureau]];
    if (disputeItems.length) routes.push({ bureau, type: 'DISPUTE', items: disputeItems, reason: `${parsed.dispute[bureau].length} dispute · ${parsed.inquiry[bureau].length} inquiry` });
    if (parsed.late[bureau].length) routes.push({ bureau, type: 'LATE_PAYMENT', items: parsed.late[bureau], reason: `${parsed.late[bureau].length} late payment` });
  });
  return routes;
}
export const recommendedSourceFormat = [
  'NAME:',
  'ADDRESS:',
  'DOB:',
  'SSN:',
  '',
  'DISPUTE ACCOUNTS',
  'TRANSUNION',
  'Account Name:',
  'Account Number:',
  '',
  'EQUIFAX',
  'Account Name:',
  'Account Number:',
  '',
  'EXPERIAN',
  'Account Name:',
  'Account Number:'
].join('\n');
export function createNormalizedSourceCopy(text: string): NormalizedSourceCopy {
  const parsed = parseSource(text);
  const usedFields = ['name', 'address', 'dob', 'ssn'].filter((field) => field === 'name' ? parsed.name : field === 'address' ? parsed.address.length : field === 'dob' ? parsed.dob : parsed.ssn);
  const reservedFields = ['phone', 'email', 'country'].filter((field) => field === 'phone' ? parsed.phone : field === 'email' ? parsed.email : parsed.country);
  return { text, usedFields, reservedFields, preservedLines: parsed.preserved };
}
