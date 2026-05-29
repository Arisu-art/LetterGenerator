export type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
export type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
export type ItemType = 'DISPUTE_ACCOUNT' | 'HARD_INQUIRY' | 'LATE_PAYMENT';
export type SourceItem = { type: ItemType; displayText: string };
export type ParsedSource = {
  name: string;
  address: string[];
  dob: string;
  ssn: string;
  dispute: Record<Bureau, SourceItem[]>;
  inquiry: Record<Bureau, SourceItem[]>;
  late: Record<Bureau, SourceItem[]>;
};
export type LetterRoute = { bureau: Bureau; type: LetterType; items: SourceItem[]; reason: string };

export const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
export const bureauInfo: Record<Bureau, { name: string; address: string }> = {
  TRANSUNION: { name: 'TransUnion LLC Consumer Dispute Center', address: 'PO Box 2000\nChester, PA 19016' },
  EQUIFAX: { name: 'Equifax Information Services LLC', address: 'PO Box 105139\nAtlanta, GA 30348' },
  EXPERIAN: { name: 'Experian', address: 'PO Box 4500\nAllen, TX 75013' }
};

function itemMap(): Record<Bureau, SourceItem[]> {
  return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] };
}
function normalized(value: string) {
  return value.replace(/:$/, '').replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}
function bureauOf(value: string): Bureau | '' {
  const key = normalized(value);
  if (key === 'TRANSUNION' || key === 'TRANS UNION' || key === 'TU') return 'TRANSUNION';
  if (key === 'EQUIFAX' || key === 'EQ') return 'EQUIFAX';
  if (key === 'EXPERIAN' || key === 'EXP') return 'EXPERIAN';
  return '';
}
type Section = 'header' | 'dispute' | 'inquiry' | 'late' | 'ignore';
function sectionOf(value: string): Section | '' {
  const key = normalized(value);
  const headerLike = !value.includes(':') || /:\s*$/.test(value);
  if (/^(FOR\s+)?DISPUTE(\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LETTER|LETTERS|RECORD|RECORDS|SECTION))?S?$/.test(key)) return 'dispute';
  if (/^HARD\s*(INQ|INQUIRY|INQUIRIES)(\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|RECORD|RECORDS|SECTION))?S?$/.test(key)) return 'inquiry';
  // TXT files can label this category as LATE PAYMENT, LATE PAYMENTS, FOR LATE PAYMENT,
  // LATE PAYMENT ACCOUNTS, or LATE PAYMENT RECORDS. All belong to one letter type.
  if (headerLike && /^(FOR\s+)?LATE\s*(PAY|PAYMENT|PAYMENTS)(\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LETTER|LETTERS|RECORD|RECORDS|SECTION|HISTORY|ONLY))?S?$/.test(key)) return 'late';
  if (/^OPEN\s+ACCOUNT/.test(key) || /^PHONE/.test(key) || /^EMAIL/.test(key)) return 'ignore';
  return '';
}
function isNoData(value: string) {
  return /^(N+ONE|NONE|NO\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LATE\s+PAYMENTS?)|N\/?A|NOTHING)$/i.test(normalized(value));
}
function item(type: ItemType, lines: string[]): SourceItem | null {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  if (!clean.length || clean.every(isNoData)) return null;
  return { type, displayText: clean.join('\n') };
}

export function parseSource(text: string): ParsedSource {
  const parsed: ParsedSource = { name: '', address: [], dob: '', ssn: '', dispute: itemMap(), inquiry: itemMap(), late: itemMap() };
  const header: string[] = [];
  let section: Section = 'header';
  let bureau: Bureau | '' = '';
  let buffer: string[] = [];
  const flush = () => {
    if (!bureau || !buffer.length) { buffer = []; return; }
    const created = section === 'dispute' ? item('DISPUTE_ACCOUNT', buffer) : section === 'late' ? item('LATE_PAYMENT', buffer) : null;
    if (created && section === 'dispute') parsed.dispute[bureau].push(created);
    if (created && section === 'late') parsed.late[bureau].push(created);
    buffer = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const nextSection = sectionOf(line);
    if (nextSection) { flush(); section = nextSection; bureau = ''; continue; }
    const nextBureau = bureauOf(line);
    if (nextBureau) { flush(); bureau = nextBureau; continue; }
    if (section === 'header') { header.push(line); continue; }
    if (section === 'inquiry' && bureau) {
      const created = item('HARD_INQUIRY', [line]);
      if (created) parsed.inquiry[bureau].push(created);
      continue;
    }
    if ((section === 'dispute' || section === 'late') && bureau) {
      if (/^(ACCOUNT|CREDITOR)\s+NAME\s*:/i.test(line) && buffer.length) flush();
      buffer.push(line);
    }
  }
  flush();
  parsed.name = header[0] || '';
  parsed.dob = (header.find((line) => /^DOB:/i.test(line)) || '').replace(/^DOB:\s*/i, '');
  parsed.ssn = (header.find((line) => /^SSN:/i.test(line)) || '').replace(/^SSN:\s*/i, '');
  parsed.address = header.slice(1).filter((line) => !/^(DOB|SSN):/i.test(line));
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
        : accountItems.length ? `${accountItems.length} dispute account(s).` : `${inquiryItems.length} hard inquiry item(s).`;
      routes.push({ bureau, type: 'DISPUTE', items: [...accountItems, ...inquiryItems], reason });
    }
    if (lateItems.length) routes.push({ bureau, type: 'LATE_PAYMENT', items: lateItems, reason: `${lateItems.length} late-payment item(s).` });
    return routes;
  });
}
