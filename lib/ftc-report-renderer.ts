import JSZip from 'jszip';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

type FtcModel = {
  reportNumber: string;
  reportDate: string;
  fullName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  address: string;
  phone: string;
  email: string;
  statement: string;
  accounts: FtcAffectedAccount[];
};

const FTC_TEMPLATE_URL = '/templates/ftc-standard.docx';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DEFAULT_REPORT_NUMBER = '202084447';

const FTC_STATEMENT = 'I AM A VICTIM OF IDENTITY THEFT AND REQUEST THE IMMEDIATE ENFORCEMENT OF MY RIGHTS UNDER FCRA SECTION 605B (15 U.S.C. § 1681c-2). ANY FRAUDULENT ACCOUNTS, INQUIRIES, OR INFORMATION RESULTING FROM THIS THEFT MUST BE BLOCKED AND REMOVED FROM MY CREDIT FILE. UPON RECEIPT OF THIS NOTICE, YOU ARE LEGALLY REQUIRED TO BLOCK SUCH INFORMATION WITHIN FOUR (4) BUSINESS DAYS; THIS IS A STATUTORY OBLIGATION, NOT A REQUEST. ANY FAILURE TO COMPLY CONSTITUTES A VIOLATION OF FEDERAL LAW AND MAY RESULT IN LEGAL ACTION. I EXPECT FULL COMPLIANCE AND WRITTEN CONFIRMATION THAT ALL FRAUDULENT INFORMATION HAS BEEN REMOVED.';

const TEMPLATE_SEQUENCE = [
  'FTC', ' ', 'Report', ' ', 'Number: ', 'REPORT_NUMBER_A', 'REPORT_NUMBER_B',
  'FTC', ' ', 'Report', ' ', 'Number: ', 'REPORT_NUMBER_A', 'REPORT_NUMBER_B',
  'I', ' ', 'am', ' ', 'a', ' ', 'victim', ' ', 'of', ' ', 'Identity', ' ', 'theft.', ' ', 'This', ' ', 'is', ' ', 'my', ' ', 'official', ' ', 'statement', ' ', 'about', ' ', 'the', ' crime.',
  'FIRST_NAME', 'LAST_NAME', 'ADDRESS_LINE_1', 'ADDRESS_LINE_2', 'USA', 'PHONE_A', '-', 'PHONE_B',
  'STATEMENT',
  '            ', 'ACCOUNT_1_NAME', '                                                                                 ', 'ACCOUNT_1_NUMBER', 'ACCOUNT_1_FRAUD_BEGAN', 'ACCOUNT_1_DISCOVERED', '$', ' ', 'ACCOUNT_1_AMOUNT',
  '            ', 'ACCOUNT_2_NAME', '                                                                                ', 'ACCOUNT_2_NUMBER', 'ACCOUNT_2_FRAUD_BEGAN', 'ACCOUNT_2_DISCOVERED', '$', ' ', 'ACCOUNT_2_AMOUNT',
  '            ', 'ACCOUNT_3_NAME', '                                                                                ', 'ACCOUNT_3_NUMBER', 'ACCOUNT_3_FRAUD_BEGAN', 'ACCOUNT_3_DISCOVERED', '$', ' ', 'ACCOUNT_3_AMOUNT',
  '            ', 'ACCOUNT_4_NAME', '                                                                                ', 'ACCOUNT_4_NUMBER', 'ACCOUNT_4_FRAUD_BEGAN', 'ACCOUNT_4_DISCOVERED', '$', ' ', 'ACCOUNT_4_AMOUNT',
  '            ', 'ACCOUNT_5_NAME', 'ACCOUNT_5_FRAUD_BEGAN', 'ACCOUNT_5_DISCOVERED_A', '/', 'ACCOUNT_5_DISCOVERED_B',
  'I understand that knowingly making any false statements to the government may violate federal, state, or local criminal statutes, and may result in a fine, imprisonment, or both.',
  'SIGNATURE_NAME', 'PRINTED_NAME', 'DATE_A', 'DATE_B', 'Date',
  'Use this form to prove to businesses and credit bureaus that you have submitted an FTC Identity Theft Report to law enforcement. Some businesses might request that you also file a report with your local police.',
  'https://www.identitytheft.gov/'
];

function xml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value.replace(/[()]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-');
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

function monthYear(value: string) {
  const clean = String(value || '').trim();
  const match = clean.match(/(\d{1,2})\/(?:\d{1,2}\/)?(\d{2,4})/);
  if (!match) return clean;
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${Number(match[1])}/${year}`;
}

function reportMonthYear(source: ParsedSource) {
  return monthYear((source as any).ftcReportDate || (source as any).date || new Date().toLocaleDateString('en-US'));
}

function amountDisplay(value: string) {
  return String(value || '').replace(/^\$/, '').replace(/,/g, '').trim();
}

function deriveDisputeAccount(displayText: string, fallbackFraudDate: string): FtcAffectedAccount | null {
  const lines = String(displayText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '').trim();
  const accountNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '').trim();
  const compact = lines.join(' ').match(/(?:^|\s)(\d{1,8}(?:\.\d{1,2})?)?\s*((?:0?[1-9]|1[0-2])\/(?:19|20)?\d{2})(?:\s|$)/);

  if (!accountName) return null;

  return {
    accountName,
    accountNumber,
    fraudBegan: fallbackFraudDate,
    dateDiscovered: compact?.[2] ? monthYear(compact[2]) : '',
    fraudulentAmount: compact?.[1] || ''
  };
}

function deriveInquiryAccount(displayText: string, fallbackFraudDate: string): FtcAffectedAccount | null {
  const normalized = String(displayText || '').replace(/\s*[–—]\s*/g, ' - ').trim();
  const match = normalized.match(/^(.+?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
  if (!match) return null;

  return {
    accountName: match[1].trim(),
    accountNumber: '',
    fraudBegan: fallbackFraudDate,
    dateDiscovered: monthYear(match[2]),
    fraudulentAmount: ''
  };
}

export function buildFtcAffectedAccounts(source: ParsedSource): FtcAffectedAccount[] {
  const fallbackFraudDate = reportMonthYear(source);
  const explicit = Array.isArray((source as any).ftcAccounts) ? ((source as any).ftcAccounts as FtcAffectedAccount[]) : [];

  const disputeItems = Object.values((source as any).dispute || {})
    .flat()
    .map((item: any) => {
      const base = deriveDisputeAccount(item?.displayText || '', fallbackFraudDate);
      if (!base) return null;
      return {
        ...base,
        dateDiscovered: item?.ftcDerived?.dateDiscovered || base.dateDiscovered,
        fraudulentAmount: item?.ftcDerived?.fraudulentAmount || base.fraudulentAmount
      };
    })
    .filter(Boolean) as FtcAffectedAccount[];

  const inquiryItems = Object.values((source as any).inquiry || {})
    .flat()
    .map((item: any) => deriveInquiryAccount(item?.displayText || '', fallbackFraudDate))
    .filter(Boolean) as FtcAffectedAccount[];

  const seen = new Set<string>();

  return [...explicit, ...disputeItems, ...inquiryItems]
    .map((item) => ({
      accountName: item.accountName || '',
      accountNumber: item.accountNumber || '',
      fraudBegan: item.fraudBegan || fallbackFraudDate,
      dateDiscovered: item.dateDiscovered || '',
      fraudulentAmount: amountDisplay(item.fraudulentAmount)
    }))
    .filter((item) => {
      const key = `${item.accountName.toUpperCase()}|${item.accountNumber.toUpperCase()}|${item.dateDiscovered}`;
      if (!item.accountName || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const amountA = Number(a.fraudulentAmount || 0);
      const amountB = Number(b.fraudulentAmount || 0);
      return amountB - amountA;
    })
    .slice(0, 5);
}

function modelFromSource(source: ParsedSource, documentDate: string): FtcModel {
  const sourceAny = source as any;
  const fullName = sourceAny.name || '';
  const parts = splitName(fullName);
  const addressLines = Array.isArray(sourceAny.address) ? sourceAny.address : [];
  const address = [...addressLines, sourceAny.country || 'USA'].filter(Boolean).join('\n');

  return {
    reportNumber: sourceAny.ftcReportNumber || DEFAULT_REPORT_NUMBER,
    reportDate: documentDate,
    fullName,
    firstName: sourceAny.firstName || parts.firstName,
    middleName: sourceAny.middleName || parts.middleName,
    lastName: sourceAny.lastName || parts.lastName,
    address,
    phone: normalizePhone(sourceAny.phone || ''),
    email: sourceAny.email || '',
    statement: sourceAny.ftcStatement || FTC_STATEMENT,
    accounts: buildFtcAffectedAccounts(source)
  };
}

function splitReportNumber(value: string) {
  const clean = value || DEFAULT_REPORT_NUMBER;
  return [clean.slice(0, 6), clean.slice(6)];
}

function splitDateForTemplate(value: string) {
  const clean = value || '';
  const match = clean.match(/^(\d{1,2})(\/\d{1,2}\/\d{2,4})$/);
  return match ? [match[1], match[2]] : [clean, ''];
}

function splitPhoneForTemplate(value: string) {
  const clean = normalizePhone(value);
  const match = clean.match(/^(\d{3})-(\d{3}-\d{4})$/);
  return match ? [match[1], match[2]] : [clean, ''];
}

function splitMonthYear(value: string) {
  const clean = monthYear(value);
  const match = clean.match(/^(\d{1,2})\/(\d{4})$/);
  return match ? [match[1], match[2]] : [clean, ''];
}

function replacementForToken(token: string, model: FtcModel) {
  const [reportA, reportB] = splitReportNumber(model.reportNumber);
  const [phoneA, phoneB] = splitPhoneForTemplate(model.phone);
  const [dateA, dateB] = splitDateForTemplate(model.reportDate);
  const addressParts = model.address.split(/\n/);

  const direct: Record<string, string> = {
    REPORT_NUMBER_A: reportA,
    REPORT_NUMBER_B: reportB,
    FIRST_NAME: model.firstName,
    LAST_NAME: model.lastName,
    ADDRESS_LINE_1: addressParts[0] || '',
    ADDRESS_LINE_2: addressParts.slice(1).join('\n'),
    PHONE_A: phoneA,
    PHONE_B: phoneB,
    STATEMENT: model.statement,
    SIGNATURE_NAME: model.fullName,
    PRINTED_NAME: model.fullName,
    DATE_A: dateA,
    DATE_B: dateB
  };

  if (direct[token] !== undefined) return direct[token];

  const accountMatch = token.match(/^ACCOUNT_(\d+)_(NAME|NUMBER|FRAUD_BEGAN|DISCOVERED|DISCOVERED_A|DISCOVERED_B|AMOUNT)$/);
  if (!accountMatch) return token;

  const account = model.accounts[Number(accountMatch[1]) - 1];
  if (!account) return '';

  const [, , field] = accountMatch;
  const [discA, discB] = splitMonthYear(account.dateDiscovered);

  if (field === 'NAME') return account.accountName;
  if (field === 'NUMBER') return account.accountNumber;
  if (field === 'FRAUD_BEGAN') return account.fraudBegan;
  if (field === 'DISCOVERED') return account.dateDiscovered;
  if (field === 'DISCOVERED_A') return discA;
  if (field === 'DISCOVERED_B') return discB;
  if (field === 'AMOUNT') return account.fraudulentAmount;

  return '';
}

function patchTemplateDocumentXml(documentXml: string, model: FtcModel) {
  let index = 0;

  return documentXml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (match, attrs, text) => {
    const decoded = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    while (index < TEMPLATE_SEQUENCE.length) {
      const token = TEMPLATE_SEQUENCE[index++];
      const stableLiteral = !/^[A-Z0-9_]+$/.test(token);

      if (stableLiteral) {
        if (decoded === token.trim() || text === token || decoded === token) return match;
        continue;
      }

      return `<w:t${attrs}>${xml(replacementForToken(token, model))}</w:t>`;
    }

    return match;
  });
}

async function loadTemplateZip(templateFile?: File) {
  if (templateFile) {
    return JSZip.loadAsync(await templateFile.arrayBuffer());
  }

  if (typeof fetch !== 'function') {
    throw new Error('FTC template loading requires browser fetch.');
  }

  const response = await fetch(FTC_TEMPLATE_URL);
  if (!response.ok) {
    throw new Error('FTC DOCX template missing. Upload the FTC Identity Theft Report template in Templates, or add public/templates/ftc-standard.docx.');
  }

  return JSZip.loadAsync(await response.arrayBuffer());
}

async function renderFromTemplate(source: ParsedSource, documentDate: string, templateFile?: File) {
  const zip = await loadTemplateZip(templateFile);
  if (!zip) return null;

  const document = zip.file('word/document.xml');
  if (!document) return null;

  const model = modelFromSource(source, documentDate);
  const documentXml = await document.async('string');

  zip.file('word/document.xml', patchTemplateDocumentXml(documentXml, model));

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

function generatedFallbackDocXml(source: ParsedSource, documentDate: string) {
  const model = modelFromSource(source, documentDate);
  const accountRows = model.accounts
    .map((account) => {
      return [
        `Company or Organization: ${account.accountName}`,
        `Account Number: ${account.accountNumber}`,
        `Date fraud began: ${account.fraudBegan}`,
        `Date that I discovered it: ${account.dateDiscovered}`,
        `Total fraudulent amount: ${account.fraudulentAmount ? `$ ${account.fraudulentAmount}` : ''}`
      ].join('\\n');
    })
    .join('\\n\\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Federal Trade Commission Identity Theft Report</w:t></w:r></w:p>
<w:p><w:r><w:t>FTC Report Number: ${xml(model.reportNumber)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${xml(model.fullName)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${xml(model.address)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${xml(model.phone)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${xml(model.statement)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${xml(accountRows)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${xml(model.fullName)} ${xml(model.reportDate)}</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
}

async function renderFallback(source: ParsedSource, documentDate: string) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  zip.folder('_rels')?.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
  zip.folder('word')?.file('document.xml', generatedFallbackDocXml(source, documentDate));
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  zip.folder('docProps')?.file('core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>FTC Identity Theft Report</dc:title><dc:creator>LetterGenerator</dc:creator></cp:coreProperties>');
  zip.folder('docProps')?.file('app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LetterGenerator</Application></Properties>');

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

export async function renderFtcIdentityTheftReportDocx(source: ParsedSource, documentDate: string, templateFile?: File) {
  const templated = await renderFromTemplate(source, documentDate, templateFile);

  if (!templated) {
    throw new Error('FTC output blocked: the official FTC standard template was not loaded. The app will not generate a simplified fallback FTC document.');
  }

  return templated;
}
