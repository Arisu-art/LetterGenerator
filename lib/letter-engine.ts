export type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
export type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
export type ItemType = 'DISPUTE_ACCOUNT' | 'HARD_INQUIRY' | 'LATE_PAYMENT';
export type SourceItem = { type: ItemType; displayText: string };
export type ParseDiagnostic = { level: 'warning' | 'info'; message: string; line?: number };
export type ParsedSource = {
  name: string;
  address: string[];
  dob: string;
  ssn: string;
  dispute: Record<Bureau, SourceItem[]>;
  inquiry: Record<Bureau, SourceItem[]>;
  late: Record<Bureau, SourceItem[]>;
  diagnostics: ParseDiagnostic[];
};
export type LetterRoute = { bureau: Bureau; type: LetterType; items: SourceItem[]; reason: string };

export const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
export const bureauInfo: Record<Bureau, { name: string; address: string }> = {
  TRANSUNION: { name: 'TransUnion LLC Consumer Dispute Center', address: 'PO Box 2000\nChester, PA 19016' },
  EQUIFAX: { name: 'Equifax Information Services LLC', address: 'PO Box 105139\nAtlanta, GA 30348' },
  EXPERIAN: { name: 'Experian', address: 'PO Box 4500\nAllen, TX 75013' }
};

type Section = 'header' | 'dispute' | 'inquiry' | 'late' | 'ignore';
type ItemStore = Record<Bureau, SourceItem[]>;
const DATE_PATTERN = /\b(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:\d{2}|\d{4})\b/;
const ACCOUNT_NAME = /^(?:ACCOUNT|CREDITOR|FURNISHER|COMPANY)\s*(?:NAME)?\s*[:#-]\s*(.+)$/i;
const ACCOUNT_NUMBER = /^(?:ACCOUNT|ACCT)\s*(?:NUMBER|NO\.?|#)\s*[:#-]\s*(.+)$/i;

function itemMap(): ItemStore { return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }; }
function normalized(value: string) {
  return value.replace(/[\[\]{}()=*#_]+/g, ' ').replace(/[:\-|/]+$/g, '').replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}
function safeLine(value: string) { return value.replace(/\s+/g, ' ').trim(); }
function bureauIn(value: string): Bureau | '' {
  const key = normalized(value);
  if (/\b(TRANS\s*UNION|TRANSUNION|TU)\b/.test(key)) return 'TRANSUNION';
  if (/\b(EQUIFAX|EQ)\b/.test(key)) return 'EQUIFAX';
  if (/\b(EXPERIAN|EXP)\b/.test(key)) return 'EXPERIAN';
  return '';
}
function isBureauHeading(value: string) {
  const key = normalized(value).replace(/^(CREDIT\s+)?BUREAU\s+/, '');
  return /^(TRANS\s*UNION|TRANSUNION|TU|EQUIFAX|EQ|EXPERIAN|EXP)$/.test(key);
}
function sectionOf(value: string): Section | '' {
  const key = normalized(value);
  if (/\b(HARD\s*(INQ|INQUIRY|INQUIRIES)|INQUIRY\s+REMOVAL)\b/.test(key)) return 'inquiry';
  if (/\b(LATE\s*(PAY|PAYMENT|PAYMENTS)|PAYMENT\s+HISTORY\s+DISPUTE)\b/.test(key)) return 'late';
  if (/\b(FOR\s+DISPUTE|DISPUTE\s+(ACCOUNTS?|ITEMS?|RECORDS?|LETTERS?)|FRAUDULENT\s+ACCOUNTS?|IDENTITY\s+THEFT\s+ACCOUNTS?)\b/.test(key) || /^(DISPUTE|DISPUTES)$/.test(key)) return 'dispute';
  if (/^(OPEN\s+ACCOUNTS?|PERSONAL\s+INFORMATION|PHONE|EMAIL|EMPLOYMENT|SUMMARY)$/.test(key)) return 'ignore';
  return '';
}
function isSectionHeading(value: string, section: Section) {
  const key = normalized(value);
  if (section === 'inquiry') return key.length < 54 && /HARD\s*(INQ|INQUIRY|INQUIRIES)|INQUIRY\s+REMOVAL/.test(key);
  if (section === 'late') return key.length < 62 && /LATE\s*(PAY|PAYMENT|PAYMENTS)|PAYMENT\s+HISTORY\s+DISPUTE/.test(key);
  if (section === 'dispute') return key.length < 72 && /DISPUTE|FRAUDULENT\s+ACCOUNTS?|IDENTITY\s+THEFT\s+ACCOUNTS?/.test(key);
  return section === 'ignore';
}
function isNoData(value: string) {
  return /^(N+ONE|NONE|NO\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LATE\s+PAYMENTS?|HARD\s+INQUIR(?:Y|IES))|N\/?A|NOTHING|NOT\s+APPLICABLE)$/i.test(normalized(value));
}
function cleanLines(lines: string[]) { return lines.map(safeLine).filter(Boolean).filter((line) => !isNoData(line)); }
function fieldValue(lines: string[], pattern: RegExp) {
  for (const line of lines) { const match = line.match(pattern); if (match?.[1]) return safeLine(match[1]); }
  return '';
}
function disputeDisplayText(lines: string[]) {
  const clean = cleanLines(lines);
  const name = fieldValue(clean, ACCOUNT_NAME);
  const number = fieldValue(clean, ACCOUNT_NUMBER);
  if (!name && !number) return '';
  return [name ? `Account Name: ${name}` : '', number ? `Account Number: ${number}` : ''].filter(Boolean).join('\n');
}
function lateDisplayText(lines: string[]) {
  const clean = cleanLines(lines);
  const name = fieldValue(clean, ACCOUNT_NAME);
  const number = fieldValue(clean, ACCOUNT_NUMBER);
  const relevant = clean.filter((line) => /late|payment|30\s*day|60\s*day|90\s*day|120\s*day/i.test(line));
  if (!name && !number) return '';
  return [name ? `Account Name: ${name}` : '', number ? `Account Number: ${number}` : '', ...relevant.filter((line) => !ACCOUNT_NAME.test(line) && !ACCOUNT_NUMBER.test(line))].filter(Boolean).join('\n');
}
function inquiryDisplayText(lines: string[]) {
  const clean = cleanLines(lines);
  const joined = clean.join(' - ');
  if (!DATE_PATTERN.test(joined)) return '';
  return joined.replace(/\s*[-–—]\s*/g, ' - ').replace(/\s+/g, ' ').trim();
}
function createItem(type: ItemType, lines: string[]) {
  const displayText = type === 'DISPUTE_ACCOUNT' ? disputeDisplayText(lines) : type === 'HARD_INQUIRY' ? inquiryDisplayText(lines) : lateDisplayText(lines);
  return displayText ? { type, displayText } : null;
}
function appendUnique(target: SourceItem[], item: SourceItem | null, diagnostics: ParseDiagnostic[], bureau: Bureau) {
  if (!item) return;
  const key = `${item.type}|${normalized(item.displayText)}`;
  if (target.some((current) => `${current.type}|${normalized(current.displayText)}` === key)) {
    diagnostics.push({ level: 'info', message: `Duplicate ${item.type.toLowerCase().replaceAll('_', ' ')} removed for ${bureau}.` });
    return;
  }
  target.push(item);
}
function headerField(lines: string[], label: RegExp) {
  const line = lines.find((entry) => label.test(entry));
  return line ? line.replace(label, '').trim() : '';
}
function looksLikeRecord(line: string) { return ACCOUNT_NAME.test(line) || ACCOUNT_NUMBER.test(line) || DATE_PATTERN.test(line); }

/**
 * Parses both the recommended TXT format and common variants:
 * section-first, bureau-first, and combined headings such as "EQUIFAX - DISPUTE ACCOUNTS".
 * Records are never routed without an active bureau and category, which prevents false letters.
 */
export function parseSource(text: string): ParsedSource {
  const parsed: ParsedSource = { name: '', address: [], dob: '', ssn: '', dispute: itemMap(), inquiry: itemMap(), late: itemMap(), diagnostics: [] };
  const header: string[] = [];
  let section: Section = 'header';
  let bureau: Bureau | '' = '';
  let buffer: string[] = [];
  let bufferLine = 0;

  const flush = () => {
    if (!buffer.length) return;
    if (!bureau || (section !== 'dispute' && section !== 'late')) {
      if (buffer.some(looksLikeRecord)) parsed.diagnostics.push({ level: 'warning', message: 'Account-like text was ignored because its bureau or category was not identified.', line: bufferLine });
      buffer = [];
      return;
    }
    const created = createItem(section === 'dispute' ? 'DISPUTE_ACCOUNT' : 'LATE_PAYMENT', buffer);
    if (created) appendUnique(section === 'dispute' ? parsed.dispute[bureau] : parsed.late[bureau], created, parsed.diagnostics, bureau);
    else if (buffer.some(looksLikeRecord)) parsed.diagnostics.push({ level: 'warning', message: `${section === 'dispute' ? 'Dispute' : 'Late-payment'} record in ${bureau} is missing a usable account name or account number.`, line: bufferLine });
    buffer = [];
  };

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const lineNumber = index + 1;
    if (!line) { flush(); return; }
    const detectedSection = sectionOf(line);
    const detectedBureau = bureauIn(line);
    const heading = detectedSection && isSectionHeading(line, detectedSection);
    const bureauHeading = detectedBureau && (isBureauHeading(line) || Boolean(heading));
    if (heading || bureauHeading) {
      flush();
      if (heading) section = detectedSection;
      if (bureauHeading) bureau = detectedBureau;
      return;
    }
    if (section === 'header' && !bureau) { header.push(line); return; }
    if (section === 'inquiry') {
      if (!bureau) {
        if (DATE_PATTERN.test(line)) parsed.diagnostics.push({ level: 'warning', message: 'Hard inquiry ignored because no bureau heading was identified.', line: lineNumber });
        return;
      }
      if (DATE_PATTERN.test(line)) appendUnique(parsed.inquiry[bureau], createItem('HARD_INQUIRY', [line]), parsed.diagnostics, bureau);
      else if (!isNoData(line)) parsed.diagnostics.push({ level: 'warning', message: `Hard inquiry in ${bureau} must include a date on the same line: COMPANY - MM/DD/YYYY.`, line: lineNumber });
      return;
    }
    if ((section === 'dispute' || section === 'late') && bureau) {
      if (ACCOUNT_NAME.test(line) && buffer.length) flush();
      if (!buffer.length) bufferLine = lineNumber;
      buffer.push(line);
      return;
    }
    if (looksLikeRecord(line)) parsed.diagnostics.push({ level: 'warning', message: 'Record-like text was not assigned to an output. Use a category and bureau heading.', line: lineNumber });
  });
  flush();

  const firstUnlabelled = header.find((line) => !/^(NAME|CLIENT|CONSUMER|ADDRESS|DOB|SSN)\s*:/i.test(line));
  parsed.name = headerField(header, /^(?:NAME|CLIENT|CONSUMER(?:\s+NAME)?)\s*:\s*/i) || firstUnlabelled || '';
  parsed.dob = headerField(header, /^DOB\s*:\s*/i);
  parsed.ssn = headerField(header, /^SSN\s*:\s*/i);
  parsed.address = header.filter((line) => line !== parsed.name && !/^(NAME|CLIENT|CONSUMER(?:\s+NAME)?|DOB|SSN)\s*:/i.test(line)).map((line) => line.replace(/^ADDRESS\s*:\s*/i, '')).filter(Boolean);
  if (!parsed.name) parsed.diagnostics.push({ level: 'warning', message: 'Client name could not be identified in the source header.' });
  return parsed;
}

export function detectRoutes(parsed: ParsedSource): LetterRoute[] {
  return bureaus.flatMap((bureau) => {
    const accountItems = parsed.dispute[bureau];
    const inquiryItems = parsed.inquiry[bureau];
    const lateItems = parsed.late[bureau];
    const routes: LetterRoute[] = [];
    if (accountItems.length || inquiryItems.length) {
      const reason = accountItems.length && inquiryItems.length
        ? `${accountItems.length} dispute account(s) and ${inquiryItems.length} hard inquiry item(s).`
        : accountItems.length ? `${accountItems.length} dispute account(s).` : `${inquiryItems.length} hard inquiry item(s) only.`;
      routes.push({ bureau, type: 'DISPUTE', items: [...accountItems, ...inquiryItems], reason });
    }
    if (lateItems.length) routes.push({ bureau, type: 'LATE_PAYMENT', items: lateItems, reason: `${lateItems.length} late-payment item(s).` });
    return routes;
  });
}

export const recommendedSourceFormat = `NAME: CLIENT FULL NAME\nADDRESS: STREET ADDRESS\nCITY, STATE ZIP\nDOB: MM/DD/YYYY\nSSN: XXX-XX-1234\n\nDISPUTE ACCOUNTS\nTRANSUNION\nAccount Name: EXAMPLE BANK\nAccount Number: XXXX1234\n\nEQUIFAX\nNONE\n\nEXPERIAN\nAccount Name: EXAMPLE CARD\nAccount Number: XXXX9876\n\nHARD INQUIRIES\nTRANSUNION\nEXAMPLE LENDER - 08/08/2024\n\nLATE PAYMENTS\nEQUIFAX\nAccount Name: EXAMPLE AUTO\nAccount Number: XXXX5678\nLate Payment: 30 Days Late - 01/2025`;
